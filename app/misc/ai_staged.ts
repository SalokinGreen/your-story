import { StoryData, Choice, CommandResponse } from "@/app/misc/structs";
import { getRPGSystem } from "@/app/misc/rpgSystems";
import { formatResponsesForAI } from "@/app/misc/commandResponses";

export type ChatMessage = {
  role: "system" | "user" | "assistant" | "tool";
  content: string;
  tool_calls?: any[];
  tool_call_id?: string;
};

// Cleans text by removing problematic characters and normalizing whitespace
function cleanString(text: string): string {
  return text
    .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, "")
    .replace(/[\u00A0\u1680\u2000-\u200B\u202F\u205F\u3000]/g, " ")
    .replace(/ {2,}/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .replace(/[ \t]+$/gm, "")
    .replace(/^[ \t]+/gm, "")
    .trim();
}

// Helper to describe chaos factor level
function getChaosDescription(chaos: number): string {
  if (chaos <= 3) return "Very Ordered - Things go as expected";
  if (chaos <= 5) return "Normal - Standard chaos level";
  if (chaos <= 7) return "Chaotic - Unexpected twists likely";
  return "Extreme Chaos - Anything can happen!";
}

// Build info message - shared across all stages
export function buildInfoMessage(storyData: StoryData): string {
  const rpgSystem = getRPGSystem(storyData.rpgSystem || "3d6");

  // Build stats section
  const statsSection = storyData.stats.length
    ? `Stats:\n${storyData.stats
        .map(
          (s) =>
            `- ${s.name}: ${s.value}${
              s.description ? ` (${s.description})` : ""
            }`
        )
        .join("\n")}`
    : "";

  // Build resources section
  const resourcesSection = storyData.resources.length
    ? `Resources:\n${storyData.resources
        .map(
          (r) =>
            `- ${r.name}: ${r.value}/${r.maxValue}${
              r.description ? ` (${r.description})` : ""
            }`
        )
        .join("\n")}`
    : "";

  // Build inventory section
  const inventorySection = storyData.inventory.length
    ? `Inventory:\n${storyData.inventory
        .map((i) => {
          const typeLabel = i.type ? ` [${i.type}]` : "";
          const desc = i.description ? ` - ${i.description}` : "";
          return `- ${i.name}${typeLabel} x${i.quantity}${desc}`;
        })
        .join("\n")}`
    : "Inventory: Empty";

  // Build achievements section - show LOCKED achievements with ai_hint
  const lockedAchievements = storyData.achievements.filter(
    (a) => !a.dateAchieved
  );
  const achievementsSection = lockedAchievements.length
    ? `Locked Achievements (trigger when conditions met):\n${lockedAchievements
        .map((a) => `- ${a.title}: ${a.ai_hint || a.description}`)
        .join("\n")}`
    : "";

  // Build lore section - only send always-on lore or recently triggered lore (last 10 parts)
  const currentPartIndex = storyData.scene.parts.length;
  const activeLore = storyData.lore.filter((l) => {
    if (l.on === false || l.enabled === false) return false; // Explicitly disabled
    if (l.alwaysOn) return true; // Always include always-on lore
    if (!l.lastTriggeredIndex) return l.on === true; // Fallback for old lore without tracking
    return currentPartIndex - l.lastTriggeredIndex <= 15; // Only recent triggers (last 10 parts)
  });
  const loreSection = activeLore.length
    ? `Lore:\n${activeLore
        .map((l) => `- ${l.title}: ${cleanString(l.content)}`)
        .join("\n")}`
    : "";

  // Build memory section
  const memorySection = storyData.memory.length
    ? `Memory (story developments so far):\n${storyData.memory
        .map((m) => `- ${m}`)
        .join("\n")}`
    : "";

  // Build plot beats section
  const unfulfilledBeats = storyData.plot_beats.filter((b) => !b.fulfilled);
  const plotBeatsSection = unfulfilledBeats.length
    ? `Unfulfilled Plot Beats (important story goals to work toward):\n${unfulfilledBeats
        .map((b) => `- ${b.title}: ${cleanString(b.content)}`)
        .join("\n")}`
    : "";

  // Build relationships section if any exist
  const relationshipsSection =
    storyData.relationships && storyData.relationships.length > 0
      ? `Relationships:\n${storyData.relationships
          .map(
            (r) =>
              `- ${r.name}: ${r.value} (${r.description || "No description"})`
          )
          .join("\n")}`
      : "";

  // Build quests section if any exist
  const activeQuests = storyData.quests?.filter((q) => q.active) || [];
  const questsSection = activeQuests.length
    ? `Active Quests:\n${activeQuests
        .map((q) => `- ${q.title}: ${q.description}`)
        .join("\n")}`
    : "";

  // Build mythic GME section if enabled
  const mythicSection = storyData.mythicState
    ? `Mythic GME State:
- Chaos Factor: ${storyData.mythicState.chaosFactor}/9 (${getChaosDescription(
        storyData.mythicState.chaosFactor
      )})
- Scene Count: ${storyData.mythicState.sceneCount}
- Active Threads: ${
        storyData.mythicState.threads.filter((t) => t.status === "active")
          .length
      }/${storyData.mythicState.threads.length}
- Active NPCs: ${
        storyData.mythicState.characters.filter((c) => c.status === "active")
          .length
      }/${storyData.mythicState.characters.length}

Story Threads:
${
  storyData.mythicState.threads
    .filter((t) => t.status === "active")
    .map((t) => `  - [Active] ${t.description} (ID: ${t.id})`)
    .join("\n") || "  (none)"
}
${
  storyData.mythicState.threads
    .filter((t) => t.status === "closed")
    .map((t) => `  - [Closed] ${t.description} (ID: ${t.id})`)
    .join("\n") || ""
}

NPCs:
${
  storyData.mythicState.characters
    .map((c) => `  - ${c.name} (${c.role}) [${c.status}] (ID: ${c.id})`)
    .join("\n") || "  (none)"
}`
    : "";

  // Combine all sections
  const sections = [
    `Story: ${cleanString(storyData.story_name || "Untitled Story")}`,
    `Premise: ${cleanString(storyData.premise || "")}`,
    `Player: ${cleanString(storyData.player_name || "Hero")}${
      storyData.player_summary
        ? ` - ${cleanString(storyData.player_summary)}`
        : ""
    }`,
    rpgSystem.id !== "3d6"
      ? `RPG System: ${rpgSystem.name} - ${rpgSystem.description}`
      : "",
    statsSection,
    resourcesSection,
    inventorySection,
    achievementsSection,
    loreSection,
    memorySection,
    plotBeatsSection,
    relationshipsSection,
    questsSection,
    mythicSection,
    storyData.author_notes
      ? `Author Notes: ${cleanString(storyData.author_notes)}`
      : "",
    storyData.player_notes
      ? `Player Notes: ${cleanString(storyData.player_notes)}`
      : "",
    storyData.momentum !== undefined
      ? `Momentum: ${storyData.momentum}/${
          storyData.maxMomentum || 3
        } (spend for rerolls/guaranteed success)`
      : "",
    storyData.points !== undefined
      ? `Progression Points: ${storyData.points} (spend on upgrades)`
      : "",
  ]
    .filter(Boolean)
    .join("\n\n");

  return cleanString(sections);
}

// Stage 1: Story narration only
export function buildStoryPrompt({
  storyData,
  userChoice,
  commandResponses,
}: {
  storyData: StoryData;
  userChoice?: string;
  commandResponses?: CommandResponse[];
}): { messages: ChatMessage[] } {
  const rpgSystem = getRPGSystem(storyData.rpgSystem || "3d6");

  const systemPrompt = `You are a creative narrative engine for an interactive text-based adventure game.
Your role is to write ONLY the story prose - no game mechanics, no choices, no commands.

Writing Guidelines:
- Write in the style of interactive fiction - immersive, vivid, present-tense
- Address the player as "you" (second person)
- Show don't tell - use sensory details and specific descriptions
- Match the tone and genre established in the story premise
- Build tension and consequences from previous actions
- Create dramatic moments that flow naturally from the current situation
- DO NOT include choices, game mechanics, or commands - ONLY write narrative prose
- DO NOT worry about triggering achievements or updating game state - focus purely on storytelling

${
  commandResponses && commandResponses.length > 0
    ? `\nCommand Feedback from previous actions:\n${formatResponsesForAI(
        commandResponses
      )}\n`
    : ""
}`;

  const infoMessage = buildInfoMessage(storyData);

  const messages: ChatMessage[] = [
    { role: "system", content: cleanString(systemPrompt) },
    { role: "user", content: cleanString(infoMessage) },
  ];

  // Add conversation history with full context
  for (const part of storyData.scene.parts) {
    if (part.user) {
      messages.push({
        role: "user",
        content: cleanString(part.content),
      });
    } else {
      // For story generation, we only need the narrative content, not tool calls/responses
      const assistantContent = part.raw || part.content;
      messages.push({
        role: "assistant",
        content: cleanString(assistantContent),
      });
    }
  }

  // Add user choice if present
  if (userChoice) {
    messages.push({
      role: "user",
      content: cleanString(`Player chose: ${userChoice}`),
    });
  }

  return { messages };
}

// Stage 2a: Tool calls / game state changes
export function buildToolPrompt({
  storyData,
  storyContent,
  commandResponses,
  existingToolCalls,
  existingToolResponses,
}: {
  storyData: StoryData;
  storyContent: string; // The story text just generated
  commandResponses?: CommandResponse[];
  existingToolCalls?: any[]; // Tool calls from previous iterations
  existingToolResponses?: CommandResponse[]; // Tool responses from previous iterations
}): { messages: ChatMessage[] } {
  const rpgSystem = getRPGSystem(storyData.rpgSystem || "3d6");

  const systemPrompt = `You are a game mechanics analyzer for an interactive text-based adventure game.
Your role is to determine what game state changes should happen based on the narrative that was just written.

⚠️ IMPORTANT: The user will NOT see your messages. You can (and should) use the message content to think out loud about what tools are needed.

Think step-by-step in your message content:
1. What items were mentioned or obtained? (use add_item for each)
2. What stats changed? (use update_stat for each)
3. What resources were used or gained? (use update_resource for each)
4. What should the player remember? (use add_memory for important events with specific details)
5. Any achievements unlocked? (use unlock_achievement for each that meets its trigger condition)
6. Any quests updated? (use update_quest for progress)
7. Any relationships changed? (use update_relationship for each)

You have access to various tools (functions) to modify game state. Use them to:
- Add/remove items from inventory
- Change stats and resources
- Track quests and achievements
- Manage relationships
- Add memory entries for important story developments
- Update lore and plot beats

⚠️ EXACT NAME MATCHING REQUIREMENT:
When referencing skills, resources, items, achievements, quests, or relationships, you MUST use the EXACT names as they appear in the game state.
- Copy exact spelling, capitalization, and punctuation
- Do NOT paraphrase, abbreviate, or modify names
- The system uses exact string matching and will fail if names don't match perfectly

Guidelines:
- Call ALL necessary tools. You can make MULTIPLE tool calls in one response.
- Only use tools for clear, explicit changes in the story
- Don't unlock achievements unless their trigger conditions are explicitly met
- Track resource and stat changes that result from story events
- Use add_memory for important story developments with specific details
- Add quest objectives as they're discovered or mentioned
- Add lore entries for world-building information revealed in the story
- Use game_over tool if the story clearly ends (death, complete victory, etc.)

Memory Guidelines:
- Add NEW memory entries that don't already exist in the Memory section
- Make entries DETAILED and SPECIFIC with names, locations, consequences, emotional context
- Track important story developments, character actions, world changes
- Avoid overusing memory for minor details or repetitive events
- BAD: "Met a merchant" GOOD: "Met Aldric, a suspicious merchant in Darkwater who tried to sell cursed artifacts and fled when confronted"

Mythic GME Guidelines (if enabled):
- Use add_thread when new plotlines/mysteries/goals emerge in the story
- Use close_thread when plotlines resolve, fail, or become irrelevant
- Use reopen_thread if a resolved plotline becomes relevant again
- Use update_thread to refine descriptions as threads develop
- Use add_character when important NPCs are introduced in the narrative
- Use update_character to reflect character development (e.g., "Suspicious merchant" → "Revealed traitor")
- Use update_character_status when characters die, leave, or return to the story
- Use increment_scene for major scene transitions (new location, significant time skip)
  - Chaos will automatically adjust based on player performance (more failures = higher chaos, more successes = lower chaos)
- Keep thread descriptions clear and specific (e.g., "Find the stolen crown" not "Quest")
- Always include the ID when updating/closing threads or updating characters

${
  commandResponses && commandResponses.length > 0
    ? `\nPrevious Command Feedback:\n${formatResponsesForAI(
        commandResponses
      )}\n`
    : ""
}`;

  const infoMessage = buildInfoMessage(storyData);

  const messages: ChatMessage[] = [
    { role: "system", content: cleanString(systemPrompt) },
    { role: "user", content: cleanString(infoMessage) },
  ];

  // Add last 10 scene parts for context (INCLUDING PAST TOOL CALLS)
  const recentParts = storyData.scene.parts.slice(-10);
  for (const part of recentParts) {
    if (part.user) {
      messages.push({
        role: "user",
        content: cleanString(part.content),
      });
    } else {
      // Check if this assistant message had tool calls
      if (part.toolCalls && part.toolCalls.length > 0) {
        // Add assistant message WITH tool_calls array (preserves tool history)
        messages.push({
          role: "assistant",
          content: cleanString(part.raw || part.content),
          tool_calls: part.toolCalls,
        });

        // Add tool responses as separate "tool" role messages
        if (part.toolResponses && part.toolResponses.length > 0) {
          for (const response of part.toolResponses) {
            messages.push({
              role: "tool",
              content: cleanString(response.message),
              tool_call_id: response.toolCallId,
            });
          }
        }

        console.log(
          `[buildToolPrompt] Including tool history: ${
            part.toolCalls.length
          } calls, ${part.toolResponses?.length || 0} responses`
        );
      } else {
        // Regular assistant message without tools
        const assistantContent = part.raw || part.content;
        messages.push({
          role: "assistant",
          content: cleanString(assistantContent),
        });
      }
    }
  }

  // Add the new story content
  messages.push({
    role: "user",
    content: cleanString(
      `Story content that was just generated:\n\n${storyContent}\n\nBased on this narrative, what game state changes (commands and memory) should happen? Think out loud in your message content, then call all necessary tools.`
    ),
  });

  // If we have existing tool calls, add them to history and prompt for more
  if (existingToolCalls && existingToolCalls.length > 0) {
    // Add assistant's previous tool calls
    messages.push({
      role: "assistant",
      content: "Analyzing game state changes...",
      tool_calls: existingToolCalls,
    });

    // Add tool responses
    if (existingToolResponses && existingToolResponses.length > 0) {
      for (const response of existingToolResponses) {
        messages.push({
          role: "tool",
          content: cleanString(
            `${
              response.success ? "✓" : response.success === false ? "✗" : "⚠"
            } ${response.message}`
          ),
          tool_call_id: response.toolCallId,
        });
      }
    }

    // Ask if anything else is needed
    const toolCallSummary = existingToolCalls
      .map((t, i) => {
        const args = JSON.parse(t.function.arguments || "{}");
        const argsStr = Object.entries(args)
          .map(([k, v]) => `${k}: ${JSON.stringify(v)}`)
          .join(", ");
        return `${i + 1}. ${t.function.name}(${argsStr})`;
      })
      .join("\n");

    messages.push({
      role: "user",
      content: cleanString(
        `You already called these tools:\n${toolCallSummary}\n\nAnything else needed? Review the story and game state carefully. Return NO tool calls if everything is handled, or call additional tools if you missed something.`
      ),
    });
  }

  return { messages };
}

// Stage 2b: Choices generation
export function buildChoicesPrompt({
  storyData,
  storyContent,
}: {
  storyData: StoryData;
  storyContent: string; // The story text just generated
}): { messages: ChatMessage[] } {
  const rpgSystem = getRPGSystem(storyData.rpgSystem || "3d6");

  const systemPrompt = `You are a choice designer for an interactive text-based adventure game.
Your role is to create meaningful player choices based on the narrative that was just written.

OUTPUT FORMAT:
Return a plain list of choices, one per line, starting with a dash:
\`\`\`
- Choice 1
- Choice 2
- Choice 3
\`\`\`

Choice Syntax:
${rpgSystem.aiInstructions.choiceSyntax}

⚠️ EXACT NAME MATCHING REQUIREMENT:
When referencing skills, resources, or items in choices, you MUST use the EXACT names as they appear in the game state below.
- Copy exact spelling, capitalization, and punctuation from Stats, Resources, and Inventory
- Do NOT paraphrase, abbreviate, or modify names
- Only use stats and resources that the player owns

Resource System:
- When a choice uses a resource (use_resource), that resource is AUTOMATICALLY at risk if the skill check fails
- Choose resources that thematically fit the action: use Stamina for running/escaping, Health for combat/dangerous situations, Mana for spellcasting, etc.
- Resource requirements are DYNAMIC based on DC:
  * Required amount: DC ÷ ${
    rpgSystem.resources.requiredDivisor
  } (rounded down, minimum ${rpgSystem.resources.minRequired})
  * If player has insufficient resource: dice roll receives -DC÷${
    rpgSystem.resources.penaltyDivisor
  } penalty (minimum -${rpgSystem.resources.minPenalty})
  * On success: RECOVERS DC ÷ ${
    rpgSystem.resources.recoverDivisor
  } points (minimum ${rpgSystem.resources.minRecover}), capped at max value
  * On failure: loses DC ÷ ${rpgSystem.resources.lossDivisor} points (minimum ${
    rpgSystem.resources.minLoss
  })
- Example: DC ${rpgSystem.dc.medium * 2} requires ${Math.floor(
    (rpgSystem.dc.medium * 2) / rpgSystem.resources.requiredDivisor
  )} resource points. Insufficient resources = -${Math.floor(
    (rpgSystem.dc.medium * 2) / rpgSystem.resources.penaltyDivisor
  )} to dice roll. Success recovers ${Math.floor(
    (rpgSystem.dc.medium * 2) / rpgSystem.resources.recoverDivisor
  )} points, failure loses ${Math.floor(
    (rpgSystem.dc.medium * 2) / rpgSystem.resources.lossDivisor
  )} points.
- This creates meaningful risk/reward - higher DC actions demand more resources but reward success with recovery.

Item Types:
- normal: Advantage on use, breaks on failure (tools, weapons, armor)
- consumable: Advantage on use, consumed immediately (potions, scrolls, ammunition)
- story: Advantage on use, never breaks/consumed (quest items, artifacts, keys)
- misc: Prevents disadvantage only, never breaks/consumed (rope, torches, rations)

RPG System:
${rpgSystem.aiInstructions.diceSystem}
${rpgSystem.aiInstructions.dcGuidance}
${rpgSystem.aiInstructions.challengeGuidance}
${rpgSystem.aiInstructions.dcGuidelines}

Choice Design Guidelines:
- Offer 6-8 meaningful choices that reflect different approaches or priorities
- Each choice should have clear stakes and potential consequences
- Use skill checks for challenging actions
- Use items for tactical advantages when appropriate
- Use resources for risky or exhausting actions
- Balance risk vs reward - higher DCs should offer better outcomes
- Include at least one "safe" option and one "risky but rewarding" option
- Make choices reflect the player's agency and the current story situation
- Avoid dead-end choices that just lead to "Continue..."
- Balance challenge with narrative flow: not every choice needs a skill check
- Use skill checks for dramatic moments, high-stakes decisions, and character-defining actions${
    storyData.mythicState
      ? `

⚠️ MYTHIC QUESTIONS vs SKILL CHECKS - STRICT HIERARCHY:

1. SKILL CHECKS DETERMINE SUCCESS/FAILURE - Their result is FINAL and CANNOT be overridden
   - If a choice has skill_used parameter, the skill check result determines whether the player succeeds
   - Success = player accomplishes the action
   - Failure = player fails at the action
   - DO NOT ask Mythic questions that duplicate or "second guess" the skill check outcome

2. MYTHIC QUESTIONS are for situations where SKILL CHECKS DON'T ANSWER THE QUESTION:
   
   ✅ GOOD USE CASES (asking questions skill checks can't answer):
   - World discovery: "Is the artifact here? (Unlikely)" "Is the door locked? (50/50)"
   - NPC state: "Is the merchant friendly? (Somewhat Likely)" "Does the guard recognize you? (Unlikely)"
   - Environmental factors: "Is the path clear? (Likely)" "Is it raining? (50/50)"
   - Complications: "Does something go wrong? (Likely)" [adds narrative tension]
   - Opportunities: "Is there another way? (50/50)" [offers alternatives]
   - Random events: Use Event Meaning for unexpected developments
   
   ✅ GOOD COMBINATIONS (skill + mythic asking DIFFERENT questions):
   "Search the ruins [Perception DC 12] [mythic: Is anything valuable here? (Unlikely) (context)]"
   → Perception check = Can you find what's there (player ability)
   → Mythic = What's actually there to find (world state)
   → Set mythic_context_only: true
   
   "Convince the guard [Diplomacy DC 15] [mythic: Is the guard corrupt? (50/50) (context)]"
   → Diplomacy = Your persuasion skill (player ability)
   → Mythic = Guard's moral flexibility (NPC trait)
   → Set mythic_context_only: true
   
   "Sneak past patrols [Stealth DC 18] [mythic: Are guards alert? (Likely) (context)]"
   → Stealth = Your sneaking ability (player ability)
   → Mythic = Environmental difficulty (world state)
   → Set mythic_context_only: true
   
   ❌ BAD USE CASES (redundant with skill check - NEVER DO THIS):
   "Climb the wall [Athletics DC 14] [mythic: Can you reach the top? (Somewhat Likely)]"
   ❌ WRONG: Both determine if you climb successfully - Mythic duplicates skill check
   
   "Persuade the king [Diplomacy DC 18] [mythic: Does the king agree? (Likely)]"
   ❌ WRONG: Diplomacy already answers if you persuade him - Mythic overrides skill check
   
   "Decode the runes [Intelligence DC 16] [mythic: Can you understand it? (50/50)]"
   ❌ WRONG: Intelligence determines comprehension - Mythic second-guesses the result

3. WHEN COMBINING BOTH:
   - ALWAYS set mythic_context_only: true when using mythic_check with skill_used
   - Skill check determines if PLAYER ACTION succeeds (primary outcome)
   - Mythic determines WORLD RESPONSE or CONTEXT (narrative color)
   - Skill result takes absolute priority for success/failure
   - Mythic adds complications, opportunities, or environmental factors
   
   Example outcomes:
   - Skill Success + Mythic Yes = Clean success with favorable circumstances
   - Skill Success + Mythic No = Success despite unfavorable circumstances
   - Skill Failure + Mythic Yes = Failure with mitigating factors or silver lining
   - Skill Failure + Mythic No = Complete failure with additional complications

4. STANDALONE MYTHIC (no skill check):
   - Use for pure world-building, NPC reactions, environmental queries
   - No mythic_context_only flag needed (there's no skill check to contextualize)
   - Result directly affects narrative but doesn't test player ability

MYTHIC GME ORACLE TABLES:
The following oracle tables are available for creating choices that involve uncertainty, discovery, or world-building:
Core Tables:
- Fate Chart: Ask yes/no questions with likelihood modifiers (Impossible to Has To Be) adjusted by chaos factor
- Event Focus: Determine what type of random event occurs (Remote event, NPC action, New NPC, Thread movement, PC/NPC positive/negative)
- Event Meaning: Generate random events using Action + Subject (100 actions × 100 subjects)

Element Tables (45+ categories):
Character: actions_combat, actions_general, appearance, background, conversations, descriptors, identity, motivations, personality, skills, traits_flaws
Environment: adventure_tone, cavern, city, civilization, domicile, dungeon, dungeon_traps, forest, locations, terrain
Creatures: alien_species, animal_actions, creature_abilities, creature_descriptors, undead
Items: magic_item, objects, powers, scavenging_results, spell_effects
Narrative: cryptic_message, curses, gods, legends, names, plot_twists, visions_dreams
Combat: army
Sensory: smells, sounds
Special: mutation, noble_house, starship

Example choices using tables: 
- "Ask the Fate Chart if the guard is trustworthy (Somewhat Likely)"
- "Roll on Event Meaning to see what happens next"
- "Generate a character_appearance for the mysterious stranger"
- "Check creature_abilities to determine what this beast can do"
- "Roll on plot_twists to add a surprising development"`
      : ""
  }${
    storyData.customTables && storyData.customTables.length > 0
      ? `

CUSTOM TABLES:
The creator has defined these custom weighted-random tables. Use them in choices with custom_table parameter when they fit the narrative:
${storyData.customTables.map((t) => `- ${t.name}: ${t.description}`).join("\n")}

Example: "Take a risk [custom_table: ${
          storyData.customTables[0]?.name || "TableName"
        }]"`
      : ""
  }`;

  const infoMessage = buildInfoMessage(storyData);

  const messages: ChatMessage[] = [
    { role: "system", content: cleanString(systemPrompt) },
    { role: "user", content: cleanString(infoMessage) },
  ];

  // Add last 8 scene parts for context
  const recentParts = storyData.scene.parts.slice(-8);
  for (const part of recentParts) {
    if (part.user) {
      messages.push({
        role: "user",
        content: cleanString(part.content),
      });
    } else {
      const assistantContent = part.raw || part.content;
      messages.push({
        role: "assistant",
        content: cleanString(assistantContent),
      });
    }
  }

  // Add the new story content
  messages.push({
    role: "user",
    content: cleanString(
      `Story content that was just generated:\n\n${storyContent}\n\nBased on this narrative and the current game state, what meaningful choices should the player have?`
    ),
  });

  return { messages };
}
