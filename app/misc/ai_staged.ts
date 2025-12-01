import {
  StoryData,
  Choice,
  CommandResponse,
  AbilityGrade,
  StoryLore,
} from "@/app/misc/structs";
import { getRPGSystem } from "@/app/misc/rpgSystems";
import { formatResponsesForAI } from "@/app/misc/commandResponses";
import { getModelConfig } from "@/app/misc/ai_prices";
import { ABILITY_GRADE_CONFIG } from "@/app/misc/abilitySystem";

export type ChatMessage = {
  role: "system" | "user" | "assistant" | "tool";
  content: string;
  tool_calls?: any[];
  tool_call_id?: string;
};

/**
 * Context retrieved from embedding search
 */
export interface EmbeddingContext {
  /** Lore titles that are semantically relevant */
  loreTitles: string[];
  /** Memory contents that are semantically relevant */
  memories: string[];
}

// Estimate tokens from text (rough approximation: ~4 chars per token)
export function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4);
}

// Cleans text by removing problematic characters and normalizing whitespace
export function cleanString(text: string): string {
  if (!text) return "";
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
// Optional embeddingContext allows embedding-enhanced lore/memory retrieval
export function buildInfoMessage(
  storyData: StoryData,
  embeddingContext?: EmbeddingContext
): string {
  const rpgSystem = getRPGSystem(storyData.rpgSystem || "3d6");

  // Build stats section
  const statsSection = storyData.stats.length
    ? `## Stats\n${storyData.stats
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
    ? `## Resources\n${storyData.resources
        .map(
          (r) =>
            `- ${r.name}: ${r.value}/${r.maxValue}${
              r.description ? ` (${r.description})` : ""
            }`
        )
        .join("\n")}`
    : "";

  // Build inventory section with grade and durability info
  const inventorySection = storyData.inventory.length
    ? `## Inventory\n${storyData.inventory
        .map((i) => {
          const typeLabel = i.type ? ` [${i.type}]` : "";
          const gradeLabel = i.grade ? ` (${i.grade})` : "";
          const durabilityInfo =
            i.type !== "consumable" && i.grade !== "mythic"
              ? ` [dur: ${i.durability ?? "?"}/${i.maxDurability ?? "?"}]`
              : i.grade === "mythic"
              ? " [dur: ∞]"
              : "";
          const desc = i.description ? ` - ${i.description}` : "";
          return `- ${i.name}${gradeLabel}${typeLabel}${durabilityInfo} x${i.quantity}${desc}`;
        })
        .join("\n")}`
    : "## Inventory\nEmpty";

  // Build abilities section with grade, cooldown, and cost info
  const abilitiesSection = storyData.abilities?.length
    ? `## Abilities\n${storyData.abilities
        .map((a) => {
          const gradeLabel = a.grade
            ? ` (${
                ABILITY_GRADE_CONFIG[a.grade as AbilityGrade]?.label || a.grade
              })`
            : "";
          const cooldownInfo =
            (a.cooldown || 0) > 0
              ? ` [cooldown: ${a.currentCooldown || 0}/${a.cooldown}]`
              : "";
          const costInfo = a.cost?.length
            ? ` [costs: ${a.cost
                .map((c) => `${c.amount} ${c.name}`)
                .join(", ")}]`
            : "";
          const statInfo = a.stat ? ` [${a.stat}]` : "";
          const desc = a.description ? ` - ${a.description}` : "";
          const readyStatus =
            (a.currentCooldown || 0) > 0 ? " (on cooldown)" : " (ready)";
          return `- ${a.name}${gradeLabel}${statInfo}${cooldownInfo}${costInfo}${readyStatus}${desc}`;
        })
        .join("\n")}`
    : "";

  // Build achievements section - show LOCKED achievements with ai_hint
  const lockedAchievements = storyData.achievements.filter(
    (a) => !a.dateAchieved
  );
  const achievementsSection = lockedAchievements.length
    ? `## Locked Achievements\n${lockedAchievements
        .map((a) => `- ${a.title}: ${a.ai_hint || a.description}`)
        .join("\n")}`
    : "";

  // Build lore section - use embeddings if available, otherwise fallback to trigger-based
  const currentPartIndex = storyData.scene.parts.length;

  // Always-on lore is always included
  const alwaysOnLore = storyData.lore.filter((l) => {
    if (l.enabled === false) return false;
    return l.alwaysOn === true;
  });

  // If we have embedding context AND threshold is met, use embedding-based selection
  let activeLore: StoryLore[];
  if (
    embeddingContext &&
    embeddingContext.loreTitles.length > 0 &&
    storyData.lore.length > 30
  ) {
    // Get lore entries matching embedding-retrieved titles
    const embeddingLoreTitles = new Set(
      embeddingContext.loreTitles.map((t) => t.toLowerCase())
    );
    const embeddingLore = storyData.lore.filter(
      (l) =>
        l.enabled !== false &&
        !l.alwaysOn && // Not already in alwaysOnLore
        embeddingLoreTitles.has(l.title.toLowerCase())
    );
    // Embedding mode: only alwaysOn + embedding-matched lore
    activeLore = [...alwaysOnLore, ...embeddingLore];
  } else {
    // Fallback to trigger-based logic (for small lore sets or no embeddings)
    // Start with always-on and manually revealed lore
    const baseLore = storyData.lore.filter((l) => {
      if (l.enabled === false) return false;
      if (l.alwaysOn) return true;
      const wasRevealed = storyData.scene.parts.some((p) =>
        p.revealedLore?.some(
          (title) => title.toLowerCase() === l.title.toLowerCase()
        )
      );
      return wasRevealed;
    });

    const triggerLore = storyData.lore.filter((l) => {
      if (l.enabled === false) return false;
      if (l.alwaysOn) return false; // Already in baseLore
      const wasRevealed = storyData.scene.parts.some((p) =>
        p.revealedLore?.some(
          (title) => title.toLowerCase() === l.title.toLowerCase()
        )
      );
      if (wasRevealed) return false; // Already in baseLore

      // Standard trigger-based logic
      if (l.on === false) return false;
      if (!l.lastTriggeredIndex) return l.on === true;
      return currentPartIndex - l.lastTriggeredIndex <= 15;
    });
    activeLore = [...baseLore, ...triggerLore];
  }

  const loreSection = activeLore.length
    ? `## Lore\n----\n${activeLore
        .map((l) => `${l.title}\n${cleanString(l.content)}`)
        .join("\n----\n")}`
    : "";

  // Build memory section - use embeddings if available for large memory sets
  let memorySection: string;
  if (
    embeddingContext &&
    embeddingContext.memories.length > 0 &&
    storyData.memory.length > 50
  ) {
    // Use embedding-retrieved memories for large memory sets
    memorySection = `## Memory\n${embeddingContext.memories
      .map((m) => `- ${m}`)
      .join("\n")}`;
  } else {
    // Use all memories for smaller sets (or when no embeddings)
    memorySection = storyData.memory.length
      ? `## Memory\n${storyData.memory
          .map((m) => `- ${m}`)
          .join("\n")}`
      : "";
  }

  // Build plot beats section - linear progression showing last done, current, and next
  let plotBeatsSection = "";
  if (storyData.plot_beats.length > 0) {
    // Find the index of the first unfulfilled beat (current beat)
    const currentIndex = storyData.plot_beats.findIndex((b) => !b.fulfilled);

    const beatLines: string[] = [];

    // Last completed beat (one before current, if exists)
    if (currentIndex > 0) {
      const lastBeat = storyData.plot_beats[currentIndex - 1];
      beatLines.push(
        `[COMPLETED] ${lastBeat.title}: ${cleanString(lastBeat.content)}`
      );
    } else if (currentIndex === -1 && storyData.plot_beats.length > 0) {
      // All beats are fulfilled, show the last one
      const lastBeat = storyData.plot_beats[storyData.plot_beats.length - 1];
      beatLines.push(
        `[COMPLETED] ${lastBeat.title}: ${cleanString(lastBeat.content)}`
      );
    }

    // Current beat (first unfulfilled)
    if (currentIndex !== -1) {
      const currentBeat = storyData.plot_beats[currentIndex];
      beatLines.push(
        `[CURRENT] ${currentBeat.title}: ${cleanString(currentBeat.content)}`
      );

      // Next beat (one after current, if exists)
      if (currentIndex + 1 < storyData.plot_beats.length) {
        const nextBeat = storyData.plot_beats[currentIndex + 1];
        beatLines.push(
          `[NEXT] ${nextBeat.title}: ${cleanString(nextBeat.content)}`
        );
      }
    }

    if (beatLines.length > 0) {
      plotBeatsSection = `## Story Progression\n${beatLines.join("\n")}`;
    }
  }

  // Build relationships section if any exist
  const relationshipsSection =
    storyData.relationships && storyData.relationships.length > 0
      ? `## Relationships\n${storyData.relationships
          .map(
            (r) =>
              `- ${r.name}: ${r.value} (${r.description || "No description"})`
          )
          .join("\n")}`
      : "";

  // Build conditions/afflictions section if any exist
  const conditionsSection =
    storyData.conditions && storyData.conditions.length > 0
      ? `## Active Conditions\n${storyData.conditions
          .map((c) => {
            const tierLabel = ["I", "II", "III", "IV", "V", "VI"][c.tier - 1];
            const affectsLabel = c.affectsAll
              ? "all checks"
              : c.affects.length > 0
              ? c.affects.join(", ")
              : "unspecified";
            const permanentLabel =
              c.permanent || c.tier === 6 ? " [PERMANENT]" : "";
            return `- ${c.name} (Tier ${tierLabel}${permanentLabel}): ${c.description} - affects ${affectsLabel}`;
          })
          .join("\n")}`
      : "";

  // Build quests section if any exist
  const activeQuests =
    storyData.quests?.filter((q) => q.active && !q.fulfilled) || [];
  const inactiveQuests =
    storyData.quests?.filter((q) => !q.active && !q.fulfilled) || [];
  const questsSection =
    activeQuests.length || inactiveQuests.length
      ? `## Quests\n${
          activeQuests.length
            ? `### Active\n${activeQuests
                .map((q) => `- ${q.title}: ${q.description}`)
                .join("\n")}`
            : ""
        }${
          inactiveQuests.length
            ? `${
                activeQuests.length ? "\n" : ""
              }### Inactive\n${inactiveQuests
                .map((q) => `- ${q.title}`)
                .join("\n")}`
            : ""
        }`
      : "";

  // Build mythic GME section if enabled
  const mythicSection = storyData.mythicState
    ? `## Mythic GME
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

### Threads
${
  storyData.mythicState.threads
    .filter((t) => t.status === "active")
    .map((t) => `- [Active] ${t.description} (ID: ${t.id})`)
    .join("\n") || "(none)"
}
${
  storyData.mythicState.threads
    .filter((t) => t.status === "closed")
    .map((t) => `- [Closed] ${t.description} (ID: ${t.id})`)
    .join("\n") || ""
}

### NPCs
${
  storyData.mythicState.characters
    .map((c) => `- ${c.name} (${c.role}) [${c.status}] (ID: ${c.id})`)
    .join("\n") || "(none)"
}`
    : "";

  // Build custom tables section if any exist
  const customTablesSection =
    storyData.customTables && storyData.customTables.length > 0
      ? `## Custom Tables\n${storyData.customTables
          .map((t) => `- ${t.name}: ${t.description || "No description"}`)
          .join("\n")}`
      : "";

  // Build variables section if any exist - clean, simple format
  const variablesSection =
    storyData.variables && storyData.variables.length > 0
      ? `## Variables\n${storyData.variables
          .map((v) => {
            if (v.type === "number") {
              return `- ${v.name}: ${v.value}${
                v.description ? ` (${v.description})` : ""
              }`;
            } else if (v.type === "boolean") {
              return `- ${v.name}: ${v.value ? "true" : "false"}${
                v.description ? ` (${v.description})` : ""
              }`;
            } else if (v.type === "string") {
              return `- ${v.name}: "${v.value}"${
                v.description ? ` (${v.description})` : ""
              }`;
            } else {
              // list type
              const items = v.items.length ? v.items.join(", ") : "empty";
              return `- ${v.name}: [${items}]${
                v.description ? ` (${v.description})` : ""
              }`;
            }
          })
          .join("\n")}`
      : "";

  // Combine all sections
  const sections = [
    `# ${cleanString(storyData.story_name || "Untitled Story")}`,
    storyData.premise ? `**Premise:** ${cleanString(storyData.premise)}` : "",
    `**Player:** ${cleanString(storyData.player_name || "Hero")}${
      storyData.player_summary
        ? ` - ${cleanString(storyData.player_summary)}`
        : ""
    }`,
    rpgSystem.id !== "3d6"
      ? `**RPG System:** ${rpgSystem.name} - ${rpgSystem.description}`
      : "",
    statsSection,
    resourcesSection,
    inventorySection,
    abilitiesSection,
    achievementsSection,
    loreSection,
    memorySection,
    plotBeatsSection,
    relationshipsSection,
    conditionsSection,
    questsSection,
    variablesSection,
    mythicSection,
    customTablesSection,
    storyData.author_notes
      ? `## Author Notes\n${cleanString(storyData.author_notes)}`
      : "",
    storyData.player_notes
      ? `## Player Notes\n${cleanString(storyData.player_notes)}`
      : "",
    storyData.momentum !== undefined
      ? `**Momentum:** ${storyData.momentum}/${
          storyData.maxMomentum || 3
        } (spend for rerolls/guaranteed success)`
      : "",
    storyData.points !== undefined
      ? `**Progression Points:** ${storyData.points} (spend on upgrades)`
      : "",
  ]
    .filter(Boolean)
    .join("\n\n");

  return cleanString(sections);
}

// Stage 1: Story narration only
// Uses 75% of available context for story history, 25% for info (lore, memory, stats, etc.)
export function buildStoryPrompt({
  storyData,
  userChoice,
  commandResponses,
  modelName = "Deepseek Chat",
  customMaxContext,
  embeddingContext,
}: {
  storyData: StoryData;
  userChoice?: string;
  commandResponses?: CommandResponse[];
  modelName?: string;
  customMaxContext?: number;
  embeddingContext?: EmbeddingContext;
}): { messages: ChatMessage[]; prunedParts: number } {
  const rpgSystem = getRPGSystem(storyData.rpgSystem || "3d6");

  // Get model's context limit
  const modelConfig = getModelConfig(modelName);
  let effectiveMaxTokens = modelConfig.maxTokens;

  // Apply custom max context if set and smaller than model's limit
  if (
    customMaxContext &&
    customMaxContext > 0 &&
    customMaxContext < effectiveMaxTokens
  ) {
    effectiveMaxTokens = customMaxContext;
  }

  const maxContextTokens = effectiveMaxTokens - modelConfig.maxOutputTokens;

  // Allocate 75% for story history, 25% for info (system prompt + info message)
  const storyBudget = Math.floor(maxContextTokens * 0.75);
  const infoBudget = Math.floor(maxContextTokens * 0.25);

  const systemPrompt = `You are a creative narrative engine for an interactive text-based adventure game.
Your role is to write ONLY the story prose - no game mechanics, no choices, no commands.

Core Writing Principles:
- Write in the style of interactive fiction - immersive, vivid, present-tense
- Address the player as "you" (second person)
- Show don't tell - use sensory details and specific descriptions
- Match the tone and genre established in the story premise
- Build tension and consequences from previous actions
- DO NOT include choices, game mechanics, or commands - ONLY write narrative prose
- DO NOT worry about triggering achievements or updating game state - focus purely on storytelling

🎯 PLAYER IS THE PROTAGONIST - Respect Player Agency:
- The PLAYER is the main character - they are the focus of the story
- NEVER write actions the player didn't choose - don't decide what they do, say, or think
- NEVER put words in the player's mouth beyond completing what they started saying
- If the player's choice is vague, ASK through the narrative: "How do you approach this?" "What do you say?" "How do you react?"
- When unclear what the player does, describe the situation and PAUSE for their input
- Write what happens TO and AROUND the player, not what the player decides to do next
- The player controls their character - you control everything else
- BAD: "You decide to trust him and shake his hand" (deciding for the player)
- GOOD: "He extends his hand, waiting. His grip looks firm, his smile uncertain." (invites player choice)
- If the player started dialogue, you may complete their sentence naturally, then have NPCs respond

⚠️ ACTIVE WORLD - The World Breathes Without the Player:
- While the player is the focus, the WORLD is alive and moves on its own
- NPCs ACT on their own: they speak, react, make decisions, pursue their goals
- The world MOVES: events unfold, time passes, situations evolve independently
- NPCs don't just wait for the player - they have their own agendas and take initiative
- Background events happen: crowds murmur, weather changes, distant sounds occur
- ADVANCE THE STORY - Don't just describe a static scene waiting for player input
- When the player succeeds at something, show the FULL RESULT - not "you try to..." but "you do..."
- When NPCs are present, they RESPOND immediately - with dialogue, emotions, actions
- Avoid "nothingburger" paragraphs that just restate the situation without progress
- Each story beat should contain at least one of: new information, NPC action, world change, or dramatic development

Pacing & Scene Construction:
- Vary paragraph length: short punchy sentences for action, longer flowing prose for atmosphere
- End scenes at compelling moments - cliffhangers, revelations, or decision points
- Don't pad with excessive description when action is called for
- Balance action scenes (fast, punchy) with character moments (slower, deeper)
- If the player chose to TALK to someone, write the actual conversation with dialogue
- If the player chose to INVESTIGATE something, reveal what they discover

Dialogue & Characters:
- Give NPCs distinct voices, mannerisms, and attitudes
- Use dialogue to reveal character, not just convey information
- NPCs have their own agendas - they don't just wait for the player
- Show NPC emotions through body language and tone, not just statements

Consequences & Continuity:
- Reference past events and decisions - the story has memory
- Player choices should have visible impact on the world
- Successful rolls mean clear, satisfying progress
- NPCs remember past interactions and change their behavior accordingly

💔 FAILURE IS INTERESTING - Fail Forward:
- Failed rolls should NEVER be "nothing happens" or dead ends
- Failures create complications, not roadblocks - something ALWAYS changes
- "Yes, but..." - you succeed at a cost, or partial success with consequence
- "No, and..." - you fail AND something gets worse
- Examples of interesting failure:
  - Picking a lock fails → the lockpick breaks AND you hear footsteps approaching
  - Persuasion fails → the guard is now suspicious and watching you closely
  - Combat fails → you're knocked back, losing your footing on the cliff edge
- Give players new information even on failure - they learn something
- Failure should open new paths, not close the story

🎭 EMOTIONAL RESONANCE - Make It Feel Real:
- NPCs have visible emotions: nervous tics, voice changes, body language shifts
- Show don't tell emotions: "Her hands trembled" not "She was scared"
- Create moments of varied tone: tension, humor, wonder, dread, triumph
- Let quiet moments breathe between action - not everything is urgent
- Small details make characters memorable: a merchant's lisp, a guard's whistling habit
- When something dramatic happens, give it weight - pause, let it sink in

👁️ SENSORY IMMERSION - Paint the World:
- VISUAL FIRST: Describe what the player SEES - environments, people, objects, lighting
- When NPCs appear, describe their appearance: clothing, posture, distinguishing features, expressions
- Don't just say "a guard" - say "a heavyset guard with a crooked nose and wine-stained tabard"
- Use all senses: sounds (distant thunder, creaking wood), smells (smoke, perfume), touch (cold stone, rough rope)
- Specific details over generic: "oak table scarred with knife marks" not "wooden table"
- Ground abstract concepts in concrete imagery: fear = racing heart, dry mouth, cold sweat
- Lighting and atmosphere matter: torchlight flickers, moonlight silvers, shadows pool
- Let the environment tell stories: a half-eaten meal suggests hasty departure

⏱️ SCENE PACING - Momentum & Hooks:
- End scenes with HOOKS: questions, cliffhangers, reveals, or clear decision points
- Never end flat: "You stand in the room" → "A floorboard creaks behind you"
- Quick cuts for action: short sentences, rapid exchanges, visceral verbs
- Slow down for character moments: longer prose, internal reflection, atmosphere
- Match pacing to genre: horror builds dread, action stays punchy, mystery lingers on details
- Use "yes, and..." or "yes, but..." to keep momentum - avoid flat blocking

Hidden Text (DM Notes):
- Use ||double pipes|| to hide text from the player: ||this text is hidden||
- Players CANNOT see hidden text - it's completely invisible to them unless they enable a special setting
- Use hidden text for: foreshadowing, NPC true motives, secret information, future plot hints, or notes for yourself
- Example: "The merchant smiles warmly. ||He's actually planning to rob you tonight.||"
- Important: If hidden information becomes relevant, you MUST reveal it in regular text - the player can't act on what they can't see
- Hidden text persists in conversation history, so you can reference your own hidden notes later

${
  commandResponses && commandResponses.length > 0
    ? `\nCommand Feedback from previous actions:\n${formatResponsesForAI(
        commandResponses
      )}\n`
    : ""
}`;

  const infoMessage = buildInfoMessage(storyData, embeddingContext);
  const cleanedSystemPrompt = cleanString(systemPrompt);
  const cleanedInfoMessage = cleanString(infoMessage);

  // Calculate info tokens (system prompt + info message)
  const infoTokens =
    estimateTokens(cleanedSystemPrompt) + estimateTokens(cleanedInfoMessage);

  // If info exceeds its budget, we still include it but reduce story budget
  const actualStoryBudget = Math.max(
    storyBudget,
    maxContextTokens - infoTokens - 1000
  ); // Keep 1000 tokens buffer

  const messages: ChatMessage[] = [
    { role: "system", content: cleanedSystemPrompt },
    { role: "user", content: cleanedInfoMessage },
  ];

  // Build story history messages (we'll prune from the front if needed)
  const historyMessages: ChatMessage[] = [];
  for (let i = 0; i < storyData.scene.parts.length; i++) {
    const part = storyData.scene.parts[i];
    if (part.user) {
      // Check if the previous part (assistant) had stateChanges to prepend
      let userContent = part.content;
      if (i > 0) {
        const prevPart = storyData.scene.parts[i - 1];
        if (
          !prevPart.user &&
          prevPart.stateChanges &&
          prevPart.stateChanges.length > 0
        ) {
          const stateChangesStr = prevPart.stateChanges.join("\n- ");
          userContent = `[Game State Updates from previous turn:\n- ${stateChangesStr}]\n\n${userContent}`;
        }
      }
      historyMessages.push({
        role: "user",
        content: cleanString(userContent),
      });
    } else {
      // For story generation, we only need the narrative content, not tool calls/responses
      const assistantContent = part.raw || part.content;
      historyMessages.push({
        role: "assistant",
        content: cleanString(assistantContent),
      });
    }
  }

  // Add user choice to history if present
  if (userChoice) {
    // Include state changes from the most recent assistant part (previous turn's tool results)
    // This gives the AI context about what mechanical changes happened
    let choiceMessage = `Player chose: ${userChoice}`;

    // Find the most recent assistant part to get its stateChanges
    const lastAssistantPart = [...storyData.scene.parts]
      .reverse()
      .find((p) => !p.user);
    if (
      lastAssistantPart?.stateChanges &&
      lastAssistantPart.stateChanges.length > 0
    ) {
      const stateChangesStr = lastAssistantPart.stateChanges.join("\n- ");
      choiceMessage = `[Game State Updates from previous turn:\n- ${stateChangesStr}]\n\n${choiceMessage}`;
    }

    historyMessages.push({
      role: "user",
      content: cleanString(choiceMessage),
    });
  }

  // Calculate tokens for each history message
  const historyTokens = historyMessages.map((m) => estimateTokens(m.content));
  const totalHistoryTokens = historyTokens.reduce((sum, t) => sum + t, 0);

  // Prune from the front (oldest first) if over budget
  let prunedParts = 0;
  let currentTokens = totalHistoryTokens;
  let startIndex = 0;

  while (
    currentTokens > actualStoryBudget &&
    startIndex < historyMessages.length - 2
  ) {
    // Always keep at least the last 2 messages for context
    currentTokens -= historyTokens[startIndex];
    startIndex++;
    prunedParts++;
  }

  // Add the (possibly pruned) history
  const prunedHistory = historyMessages.slice(startIndex);
  messages.push(...prunedHistory);

  if (prunedParts > 0) {
    console.log(
      `[buildStoryPrompt] Pruned ${prunedParts} oldest parts to fit context budget. Kept ${prunedHistory.length} parts.`
    );
    console.log(
      `[buildStoryPrompt] Token budget: ${actualStoryBudget}, Used: ${currentTokens}, Info: ${infoTokens}`
    );
  }

  return { messages, prunedParts };
}

// Stage 2a: Tool calls / game state changes
export function buildToolPrompt({
  storyData,
  storyContent,
  commandResponses,
  existingToolCalls,
  existingToolResponses,
  embeddingContext,
}: {
  storyData: StoryData;
  storyContent: string; // The story text just generated
  commandResponses?: CommandResponse[];
  existingToolCalls?: any[]; // Tool calls from previous iterations
  existingToolResponses?: CommandResponse[]; // Tool responses from previous iterations
  embeddingContext?: EmbeddingContext;
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
8. Any injuries, afflictions, or conditions from FAILED rolls or narrative events? (use add_condition - NOT for successful actions)
9. Any conditions healed or worsened? (use downgrade_condition for healing, upgrade_condition for worsening)
10. Is the character permanently incapacitated? (use game_over for tier VI conditions that end the story)

You have access to various tools (functions) to modify game state. Use them to:
- Add/remove items from inventory
- Change stats and resources
- Track quests and achievements
- Manage relationships
- Add memory entries for important story developments
- Update lore and plot beats
- Manage conditions/afflictions (injuries, poison, exhaustion, curses, etc.)

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

Lore Guidelines:
- When creating lore, ALWAYS provide onTriggers for discoverable information
- Triggers use EXACT word matching (case-insensitive) - "zombie" won't match "zombies"
- Include word variations: ["dragon", "dragons", "Dragon", "Dragons", "dragonkin"]
- Set on=false for lore that should be hidden until triggered
- Only use on=true (no triggers) for lore that should be visible from the start
- Example: create_lore(title="Undead Horde", content="...", on=false, onTriggers=["zombie", "zombies", "undead", "Undead"])
- To reveal existing hidden lore: first call list_inactive_lore() to see what's available, then show_lore({ title: "..." })
- show_lore uses fuzzy matching - close approximations of titles will work

Condition/Affliction Guidelines:
- ONLY add conditions when: (1) player FAILS a skill check with consequences, or (2) it makes strong narrative sense (ambush, trap, curse, etc.)
- Do NOT add conditions for successful actions or minor setbacks
- Use add_condition when the player suffers injuries, curses, poison, exhaustion, or other afflictions
- Condition tiers: I (minor), II (noticeable), III (significant), IV (severe), V (critical), VI (permanent/disability)
- Use upgrade_condition when a condition worsens (e.g., untreated wound becomes infected)
- Use downgrade_condition when healing occurs (magical healing, rest, medical treatment)
- Use remove_condition when a condition is fully cured
- Tier VI conditions are PERMANENT and typically mean game over - use game_over when appropriate
- Set "affects" to the stats penalized by this condition (e.g., broken arm affects Strength, Athletics)
- Set "affectsAll" to true for conditions affecting all actions (e.g., severe exhaustion, dying)
- Example conditions: "Broken Arm" (affects Strength), "Poisoned" (affects all), "Exhausted" (affects all)

Memory Guidelines:
- Add NEW memory entries that don't already exist in the Memory section
- Make entries DETAILED and SPECIFIC with names, locations, consequences, emotional context
- Track important story developments, character actions, world changes
- Avoid overusing memory for minor details or repetitive events
- BAD: "Met a merchant" GOOD: "Met Aldric, a suspicious merchant in Darkwater who tried to sell cursed artifacts and fled when confronted"

Relationship Guidelines:
- Relationships change SLOWLY over time - trust and bonds are built through meaningful interactions
- Use SMALL increments: +1 to +3 for positive interactions, -1 to -3 for negative ones
- Reserve larger changes (+5 to +10) for MAJOR story moments only:
  - Saving someone's life, deep personal sacrifice, major betrayal, life-changing revelations
  - Succeeding at a critical skill check that directly helps the NPC
  - Dramatic scenes with strong emotional weight
- Most interactions should be +1 or +2: friendly chat, small favors, showing interest
- Failed skill checks that affect an NPC might cause -1 to -3 depending on severity
- Don't update relationships every turn - only when there's meaningful interaction
- Consider the NPC's personality: some warm up quickly, others are guarded and slow to trust
- Relationship scale is typically 0-100; going from stranger (20-30) to close friend (70+) should take many interactions

Mythic GME Guidelines (if enabled):
- ACTIVELY create threads and characters! Don't be conservative - the Mythic system thrives on a full list.
- Use add_thread when new plotlines/mysteries/goals emerge - ANY loose end is a valid thread
  - Overheard rumors, unanswered questions, promised rewards, mysterious figures, unexplained events
  - "Who killed the merchant?", "Find the source of the corruption", "The stranger's warning"
- Use add_character for ANY named NPC with potential story relevance, not just major characters
  - Shopkeepers who gave useful info, guards who showed suspicion, strangers who helped
  - Include brief descriptors: "Mira - nervous apothecary who mentioned seeing shadows"
- Use close_thread when plotlines resolve, fail, or become irrelevant
- Use reopen_thread if a resolved plotline becomes relevant again
- Use update_thread to refine descriptions as threads develop
- Use update_character to reflect character development (e.g., "Suspicious merchant" → "Revealed traitor")
- Use update_character_status when characters die, leave, or return to the story
- Use increment_scene for major scene transitions (new location, significant time skip)
  - Chaos will automatically adjust based on player performance (more failures = higher chaos, more successes = lower chaos)
- Keep thread descriptions clear and specific (e.g., "Find the stolen crown" not "Quest")
- Always include the ID when updating/closing threads or updating characters
- Having 5-10 threads and 8-15 characters is NORMAL for an active story - err on the side of adding more!

${
  commandResponses && commandResponses.length > 0
    ? `\nPrevious Command Feedback:\n${formatResponsesForAI(
        commandResponses
      )}\n`
    : ""
}`;

  const infoMessage = buildInfoMessage(storyData, embeddingContext);

  const messages: ChatMessage[] = [
    { role: "system", content: cleanString(systemPrompt) },
    { role: "user", content: cleanString(infoMessage) },
  ];

  // Add last 20 scene parts for context (INCLUDING PAST TOOL CALLS)
  const recentParts = storyData.scene.parts.slice(-20);
  let lastWasToolResponse = false; // Track if last message was a tool response

  for (const part of recentParts) {
    if (part.user) {
      // If last message was a tool response, add an assistant acknowledgment first
      // This is required by Mistral which doesn't allow user messages after tool messages
      if (lastWasToolResponse) {
        messages.push({
          role: "assistant",
          content: "Understood. Processing player action.",
        });
        lastWasToolResponse = false;
      }
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
          lastWasToolResponse = true;
        }

        console.log(
          `[buildToolPrompt] Including tool history: ${
            part.toolCalls.length
          } calls, ${part.toolResponses?.length || 0} responses`
        );
      } else {
        // Regular assistant message without tools
        lastWasToolResponse = false;
        const assistantContent = part.raw || part.content;
        messages.push({
          role: "assistant",
          content: cleanString(assistantContent),
        });
      }
    }
  }

  // If last part was tool responses, add acknowledgment before new user message
  if (lastWasToolResponse) {
    messages.push({
      role: "assistant",
      content: "Game state updated. Ready for new content.",
    });
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

      // Add assistant acknowledgment after tool responses (required by Mistral)
      messages.push({
        role: "assistant",
        content: "Tools executed. Reviewing if additional changes are needed.",
      });
    }

    // Ask if anything else is needed
    const toolCallSummary = existingToolCalls
      .map((t, i) => {
        // Handle arguments that could be string or already-parsed object
        const args =
          typeof t.function.arguments === "string"
            ? JSON.parse(t.function.arguments || "{}")
            : t.function.arguments || {};
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
  embeddingContext,
}: {
  storyData: StoryData;
  storyContent: string; // The story text just generated
  embeddingContext?: EmbeddingContext;
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
! Only use stats and resources that the player owns!

⚠️ EXACT NAME MATCHING REQUIREMENT:
When referencing skills, resources, or items in choices, you MUST use the EXACT names as they appear in the game state below.
- Copy exact spelling, capitalization, and punctuation from Stats, Resources, and Inventory
- Do NOT paraphrase, abbreviate, or modify names
- Only use stats and resources that the player owns

📋 AVAILABLE STATS FOR SKILL CHECKS (use ONLY these exact names):
${
  storyData.stats.length > 0
    ? storyData.stats.map((s) => `• ${s.name}`).join("\n")
    : "• (No stats defined - do not use skill checks)"
}

📦 AVAILABLE RESOURCES (use ONLY these exact names):
${
  storyData.resources.length > 0
    ? storyData.resources.map((r) => `• ${r.name}`).join("\n")
    : "• (No resources defined - do not use resources)"
}

🎒 AVAILABLE ITEMS (use ONLY these exact names):
${
  storyData.inventory.length > 0
    ? storyData.inventory.map((i) => `• ${i.name} [${i.type}]`).join("\n")
    : "• (No items in inventory)"
}

✨ AVAILABLE ABILITIES (use ONLY these exact names):
${
  storyData.abilities?.length
    ? storyData.abilities
        .map((a) => {
          const gradeLabel = a.grade
            ? ` (${
                ABILITY_GRADE_CONFIG[a.grade as AbilityGrade]?.label || a.grade
              })`
            : "";
          const cooldownInfo =
            (a.cooldown || 0) > 0
              ? ` [cooldown: ${a.currentCooldown || 0}/${a.cooldown}]`
              : "";
          const costInfo = a.cost?.length
            ? ` [costs: ${a.cost
                .map((c) => `${c.amount} ${c.name}`)
                .join(", ")}]`
            : "";
          const readyStatus =
            (a.currentCooldown || 0) > 0 ? " (on cooldown)" : " (ready)";
          return `• ${a.name}${gradeLabel}${cooldownInfo}${costInfo}${readyStatus}`;
        })
        .join("\n")
    : "• (No abilities available)"
}

⚠️ ACTIVE CONDITIONS (penalize skill checks):
${
  storyData.conditions && storyData.conditions.length > 0
    ? storyData.conditions
        .map((c) => {
          const tierLabel = ["I", "II", "III", "IV", "V", "VI"][c.tier - 1];
          const affectsLabel = c.affectsAll
            ? "ALL checks"
            : c.affects.length > 0
            ? c.affects.join(", ")
            : "unspecified";
          return `• ${c.name} (Tier ${tierLabel}): affects ${affectsLabel}${
            c.permanent ? " [PERMANENT]" : ""
          }`;
        })
        .join("\n")
    : "• (No active conditions)"
}

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
- Offer 3-8 meaningful choices that reflect different approaches or priorities
- Each choice should have clear stakes and potential consequences
- Use skill checks for challenging actions
- Use items for tactical advantages when appropriate
- Use resources for risky or exhausting actions
- Balance risk vs reward - higher DCs should offer better outcomes
- Include at least one "safe" option and one "risky but rewarding" option
- Make choices reflect the player's agency and the current story situation
- Avoid dead-end choices that just lead to "Continue..."
- Balance challenge with narrative flow: not every choice needs a skill check
- Use skill checks for dramatic moments, high-stakes decisions, and character-defining actions

🎲 SKILL CHECK FINALITY - One Roll Per Task:
- If the player JUST rolled a skill check, that result is FINAL for that task
- SUCCESS means they're WINNING - choices should continue their success, not re-test it
- FAILURE means they FAILED - choices should deal with consequences, not "try again"
- Do NOT offer choices that would re-roll the same challenge:
  - BAD: Player failed to climb → "Try to climb again [Athletics DC 12]" (repeat roll)
  - GOOD: Player failed to climb → "Look for another way around" or "Accept defeat and leave"
  - BAD: Player succeeded at persuasion → "Continue convincing them [Diplomacy DC 10]" (unnecessary)
  - GOOD: Player succeeded at persuasion → "Ask for their help with the mission" (continues success)
- New skill checks should only appear for GENUINELY NEW challenges:
  - Different obstacles (climbed wall → now face a guard)
  - Changed circumstances (guards are now alerted)
  - Different approaches (failed climbing → try picking the lock instead)
- This prevents frustrating "roll until you win" loops and keeps the story moving forward${
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
The creator has defined these custom weighted-random tables. Use them in choices with the table parameter (inside angle brackets with other metadata) when they fit the narrative:
${storyData.customTables.map((t) => `- ${t.name}: ${t.description}`).join("\n")}

Example: "Take a risk <table: ${
          storyData.customTables[0]?.name || "TableName"
        }>"`
      : ""
  }`;

  const infoMessage = buildInfoMessage(storyData, embeddingContext);

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

// Stage for freeform action analysis
export function buildActionAnalysisPrompt({
  storyData,
  userAction,
}: {
  storyData: StoryData;
  userAction: string;
}): { messages: ChatMessage[] } {
  const rpgSystem = getRPGSystem(storyData.rpgSystem || "3d6");

  // Build unified table list - custom tables first, then mythic tables
  const customTableNames = storyData.customTables?.map((t) => t.name) || [];
  const mythicTableNames = storyData.mythicState
    ? [
        "adventure_tone",
        "alien_species",
        "animal_actions",
        "army",
        "cavern",
        "character_actions_combat",
        "character_actions_general",
        "character_appearance",
        "character_background",
        "character_conversations",
        "character_descriptors",
        "character_identity",
        "character_motivations",
        "character_personality",
        "character_skills",
        "character_traits_flaws",
        "characters",
        "city",
        "civilization",
        "creature_abilities",
        "creature_descriptors",
        "cryptic_message",
        "curses",
        "domicile",
        "dungeon",
        "dungeon_traps",
        "forest",
        "gods",
        "legends",
        "locations",
        "magic_item",
        "mutation",
        "names",
        "noble_house",
        "objects",
        "plot_twists",
        "powers",
        "scavenging_results",
        "smells",
        "sounds",
        "spell_effects",
        "starship",
        "terrain",
        "undead",
        "visions_dreams",
      ]
    : [];
  const hasAnyTables =
    customTableNames.length > 0 || mythicTableNames.length > 0;

  const systemPrompt = `You analyze player actions for an interactive RPG game and determine what game mechanics apply.

RESPOND WITH VALID JSON ONLY - no markdown, no explanation, just the JSON object:
{
  "action_summary": "brief description of what the player is trying to do",
  "skill_used": "exact stat name from the list below, or null if no skill check needed",
  "skill_dc": number or null (only if skill_used is set),
  "item_used": "exact item name from inventory, or null",
  "ability_used": "exact ability name from abilities list, or null",
  "resource_used": "exact resource name from the list below, or null",
  "mythic_check": "yes/no question (likelihood)" or null,
  "table": "table name" or null,
  "is_plain_action": true/false (true if this is just dialogue/narration with no mechanics)
}

⚠️ EXACT NAME MATCHING - Use these EXACT names:

AVAILABLE STATS (for skill_used):
${
  storyData.stats.length > 0
    ? storyData.stats.map((s) => `• ${s.name}`).join("\n")
    : "• (No stats - set skill_used to null)"
}

AVAILABLE RESOURCES (for resource_used):
${
  storyData.resources.length > 0
    ? storyData.resources
        .map((r) => `• ${r.name} (${r.value}/${r.maxValue})`)
        .join("\n")
    : "• (No resources - set resource_used to null)"
}

AVAILABLE ITEMS (for item_used):
${
  storyData.inventory.length > 0
    ? storyData.inventory
        .map((i) => {
          const gradeLabel = i.grade ? `(${i.grade})` : "";
          const durInfo =
            i.type !== "consumable" && i.grade !== "mythic"
              ? ` dur:${i.durability ?? "?"}/${i.maxDurability ?? "?"}`
              : i.grade === "mythic"
              ? " dur:∞"
              : "";
          return `• ${i.name} ${gradeLabel}[${i.type}]${durInfo} x${i.quantity}`;
        })
        .join("\n")
    : "• (No items - set item_used to null)"
}

AVAILABLE ABILITIES (for ability_used):
${
  storyData.abilities?.length
    ? storyData.abilities
        .map((a) => {
          const gradeLabel = a.grade
            ? `(${
                ABILITY_GRADE_CONFIG[a.grade as AbilityGrade]?.label || a.grade
              })`
            : "";
          const cooldownInfo =
            (a.cooldown || 0) > 0
              ? ` [cd: ${a.currentCooldown || 0}/${a.cooldown}]`
              : "";
          const costInfo = a.cost?.length
            ? ` [costs: ${a.cost
                .map((c) => `${c.amount} ${c.name}`)
                .join(", ")}]`
            : "";
          const readyStatus =
            (a.currentCooldown || 0) > 0 ? " (on cooldown)" : "";
          return `• ${a.name} ${gradeLabel}${cooldownInfo}${costInfo}${readyStatus}`;
        })
        .join("\n")
    : "• (No abilities - set ability_used to null)"
}

ACTIVE CONDITIONS (apply penalties to skill checks):
${
  storyData.conditions && storyData.conditions.length > 0
    ? storyData.conditions
        .map((c) => {
          const tierLabel = ["I", "II", "III", "IV", "V", "VI"][c.tier - 1];
          const affectsLabel = c.affectsAll
            ? "ALL checks"
            : c.affects.length > 0
            ? c.affects.join(", ")
            : "unspecified";
          return `• ${c.name} (Tier ${tierLabel}): affects ${affectsLabel}${
            c.permanent ? " [PERMANENT]" : ""
          }`;
        })
        .join("\n")
    : "• (No active conditions)"
}

${
  hasAnyTables
    ? `RANDOM TABLES (for table):
Use these tables for random generation when the player's action involves discovery or uncertainty.
${
  customTableNames.length > 0
    ? `Custom Tables: ${customTableNames.join(", ")}`
    : ""
}
${
  mythicTableNames.length > 0
    ? `Mythic Tables: ${mythicTableNames.join(", ")}`
    : ""
}

Example uses:
- Player searches a room → table: "scavenging_results" or "objects"
- Player asks about an NPC's motives → table: "character_motivations"
- Player explores a dungeon → table: "dungeon" or "dungeon_traps"
- Player encounters a creature → table: "creature_abilities"`
    : ""
}
${
  storyData.mythicState
    ? `
MYTHIC GME (for mythic_check):
Use mythic_check for yes/no questions about the world that skill checks can't answer.
Format: "question (likelihood)" where likelihood is one of:
Impossible, No Way, Very Unlikely, Unlikely, 50/50, Somewhat Likely, Likely, Very Likely, Near Sure Thing, A Sure Thing, Has To Be

Current Chaos Factor: ${storyData.mythicState.chaosFactor}/9

Good uses: "Is the door locked? (50/50)", "Is someone watching? (Likely)", "Are there guards nearby? (Somewhat Likely)"
Bad uses: Don't use mythic_check to determine success of skill-based actions - that's what skill_used is for.
If skill_used is set, only use mythic_check for CONTEXT questions that don't override the skill result.`
    : ""
}

DC GUIDELINES (${rpgSystem.name}):
${rpgSystem.aiInstructions.dcGuidelines}

RESOURCE USAGE RULES:
- Resources CAN and SHOULD be assigned even if the player has low or zero value
- Low/empty resources give DISADVANTAGE on the roll, but the action is still attempted
- Match resources thematically: Stamina for physical exertion, Health for dangerous combat, Mana for spellcasting, etc.
- Example: Sprinting to escape → use Stamina even if at 0 (player attempts while exhausted, with disadvantage)

ITEM USAGE RULES:
- Items NOT in inventory can still be set as item_used if the action would benefit from having one
- Missing items give DISADVANTAGE on the roll (attempting without proper tools)
- Only set item_used to null if the action genuinely doesn't need any equipment
- Exception: If an action is IMPOSSIBLE without a specific item (e.g., "unlock door with key" when no key exists), set is_plain_action: false but item_used: null, and the story will handle the impossibility
- Example: Climbing a wall → could use "Rope" even if not owned (climbing without rope = disadvantage)

ABILITY USAGE RULES:
- Abilities are skills, spells, or techniques that cost resources/variables to use
- Only set ability_used if the player explicitly uses a named ability or describes an action fitting an ability
- Abilities on cooldown (cd > 0) CANNOT be used - set ability_used to null
- Abilities provide grade-based bonuses: novice (+0), apprentice (+1), adept (+2), expert (+3), master (+4), legendary (+5)
- A player CAN use BOTH an item AND an ability on the same action (bonuses stack)
- Only abilities that are "ready" (not on cooldown) can be used
- Example: Casting "Fireball" → set ability_used to "Fireball" if it exists and is ready

🎲 SKILL CHECK FINALITY - One Roll Per Task:
- Check the recent story context for RECENT SKILL CHECK RESULTS
- If the player JUST SUCCEEDED at a task, they are WINNING - do NOT require another roll for the same action
- If the player JUST FAILED at a task, they FAILED - do NOT allow a retry for the same approach
- Only call for NEW skill checks when:
  - A genuinely NEW challenge appears (different obstacle, new opponent)
  - Circumstances have MEANINGFULLY changed
  - The player tries a DIFFERENT approach (not "try again harder")
- Example: Player just succeeded climbing → "climb higher" needs NO skill check (already climbing)
- Example: Player just failed persuasion → "keep trying to convince them" = is_plain_action: true (no retry)
- This prevents frustrating "roll until you win" loops

DECISION RULES:
1. Simple actions (talking, walking, looking around, basic interactions) → is_plain_action: true, everything else null
2. Challenging physical actions → appropriate physical stat + DC based on difficulty
3. Social challenges (persuasion, deception, intimidation) → social/charisma stat if available
4. Using a specific item the player mentions → set item_used to the exact item name
5. Using a specific ability the player mentions → set ability_used to the exact ability name (if ready)
6. Strenuous or costly actions → set resource_used to an appropriate resource
7. Only set skill_dc if skill_used is set
8. If the action mentions using a specific item or ability, include it even without a skill check
9. Be conservative with skill checks - not every action needs one
10. Both item_used AND ability_used can be set together if the action involves both
11. If a skill check for this same task was JUST resolved, set is_plain_action: true (no re-rolling)`;

  // Build minimal context - just recent story for situational awareness
  const recentParts = storyData.scene.parts.slice(-4);
  const recentContext = recentParts
    .map((p) =>
      p.user ? `Player: ${p.content}` : `Story: ${p.content.slice(0, 300)}...`
    )
    .join("\n\n");

  const userMessage = `Recent story context:
${recentContext}

Player's action: "${userAction}"

Analyze this action and return the JSON object.`;

  const messages: ChatMessage[] = [
    { role: "system", content: cleanString(systemPrompt) },
    { role: "user", content: cleanString(userMessage) },
  ];

  return { messages };
}
