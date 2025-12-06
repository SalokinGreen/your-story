import {
  StoryData,
  Choice,
  CommandResponse,
  AbilityGrade,
  StoryLore,
  REST_CONFIG,
  getMemoryContent,
} from "@/app/misc/structs";
import { getRPGSystem } from "@/app/misc/rpgSystems";
import { formatResponsesForAI } from "@/app/misc/commandResponses";
import { getModelConfig } from "@/app/misc/ai_prices";
import { ABILITY_GRADE_CONFIG } from "@/app/misc/abilitySystem";
import { getActivePassives } from "@/app/misc/skillTree";

export type ChatMessage = {
  role: "system" | "user" | "assistant" | "tool";
  content: string;
  tool_calls?: any[];
  tool_call_id?: string;
};

// ============================================
// ROLE AFFIRMATION MESSAGES (Prefills)
// ============================================
// These "fake" assistant messages prime the model to follow output constraints
// by making it appear the model has already committed to the rules.

export const STORY_AFFIRMATION = `Understood. I will write the narrative response adhering to these standards:
- **Perspective:** Strict Second Person ("You"), deep POV.
- **Style:** "Show, Don't Tell" with visceral sensory details; varying sentence structure; NO banned words.
- **Agency:** I will respect the Action Result (Success/Failure) and the Active Challenge state.
- **Format:** Prose with emphasis (*italics*, **bold**) and --- breaks. No ## headers unless major scene change.

Here is the narrative:
`;

export const TOOLS_AFFIRMATION = `Understood. I will audit the narrative for game state changes:
- **Accuracy:** I will use EXACT string matching for items, stats, and quest names.
- **Challenges:** I will detect new conflicts to \`start_challenge\` and update existing ones based on the Action Result.
- **Consequences:** I will apply \`add_condition\` or \`update_resource\` if the story implies injury or exertion.
- **Syntax:** I will call the necessary tools step-by-step.`;

export const CHOICES_AFFIRMATION = `Understood. I will generate player choices following these rules:
- **Format:** Plain list with dashes, one choice per line.
- **Mechanics:** Use exact stat/resource/item names from game state.
- **Balance:** Include safe options and risky-but-rewarding options.
- **No Repeat Rolls:** Avoid re-testing the same skill check that just resolved.

Generating choices:`;

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

// Token budgets for different stages (these are for scene history only)
export const TOOL_STAGE_TOKEN_BUDGET = 12000; // ~12k tokens for tool stage history
export const CHOICES_STAGE_TOKEN_BUDGET = 4000; // ~4k tokens for choices stage history
export const ACTION_ANALYSIS_TOKEN_BUDGET = 4000; // ~4k tokens for action analysis

/**
 * Get scene parts that fit within a token budget, taking most recent first
 * @param parts - Array of scene parts
 * @param tokenBudget - Maximum tokens to include
 * @returns Array of parts that fit, preserving chronological order
 */
export function getPartsWithinTokenBudget(
  parts: StoryData["scene"]["parts"],
  tokenBudget: number
): StoryData["scene"]["parts"] {
  if (!parts || parts.length === 0) return [];

  // Start from the end (most recent) and work backwards
  const selectedParts: StoryData["scene"]["parts"] = [];
  let totalTokens = 0;

  for (let i = parts.length - 1; i >= 0; i--) {
    const part = parts[i];
    const partText = part.raw || part.content;
    const partTokens = estimateTokens(partText);

    // Include tool call/response overhead if present
    const toolOverhead =
      (part.toolCalls?.length || 0) * 50 +
      (part.toolResponses?.length || 0) * 30;

    const totalPartTokens = partTokens + toolOverhead;

    if (totalTokens + totalPartTokens > tokenBudget) {
      break; // Can't fit any more
    }

    selectedParts.unshift(part); // Add to front to maintain order
    totalTokens += totalPartTokens;
  }

  return selectedParts;
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

// Strips markdown formatting from text to save tokens in older messages
// Removes headers, bold, italics, horizontal rules while preserving the text content
export function stripMarkdown(text: string): string {
  if (!text) return "";
  return (
    text
      // Remove headers (## Header -> Header)
      .replace(/^#{1,6}\s+/gm, "")
      // Remove horizontal rules
      .replace(/^---+$/gm, "")
      // Remove bold (**text** or __text__ -> text)
      .replace(/\*\*([^*]+)\*\*/g, "$1")
      .replace(/__([^_]+)__/g, "$1")
      // Remove italics (*text* or _text_ -> text)
      .replace(/\*([^*]+)\*/g, "$1")
      .replace(/_([^_]+)_/g, "$1")
      // Remove strikethrough (~~text~~ -> text)
      .replace(/~~([^~]+)~~/g, "$1")
      // Remove inline code (`code` -> code)
      .replace(/`([^`]+)`/g, "$1")
      // Collapse multiple newlines left by removed elements
      .replace(/\n{3,}/g, "\n\n")
      .trim()
  );
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
            i.type !== "consumable" && i.grade !== "agmt"
              ? ` [dur: ${i.durability ?? "?"}/${i.maxDurability ?? "?"}]`
              : i.grade === "agmt"
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

  // Build passive effects section from skill trees and other sources
  // Passives are story/RP traits that influence narrative and difficulty, not direct mechanical bonuses
  const passives = getActivePassives(storyData);
  const passivesSection = passives.length
    ? `## Passive Traits\nThese are story/RP traits that influence narrative, difficulty, and NPC reactions - consider them when setting DCs and describing outcomes:\n${passives
        .map((p) => `- ${p.name}: ${p.description}`)
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

  // If we have embedding context, use embedding-based selection
  let activeLore: StoryLore[];
  if (embeddingContext && embeddingContext.loreTitles.length > 0) {
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

  // Build memory section - use embeddings if available
  let memorySection: string;
  if (embeddingContext && embeddingContext.memories.length > 0) {
    // Use embedding-retrieved memories
    memorySection = `## Memory\n${embeddingContext.memories
      .map((m) => `- ${m}`)
      .join("\n")}`;
  } else {
    // Use all memories for smaller sets (or when no embeddings)
    memorySection = storyData.memory.length
      ? `## Memory\n${storyData.memory
          .map((m) => `- ${getMemoryContent(m)}`)
          .join("\n")}`
      : "";
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
            ? `${activeQuests.length ? "\n" : ""}### Inactive\n${inactiveQuests
                .map((q) => `- ${q.title}`)
                .join("\n")}`
            : ""
        }`
      : "";

  // Build Advanced RPG Tools section if enabled
  const agmtSection = storyData.agmtState
    ? `## Advanced RPG Tools
- Chaos Factor: ${storyData.agmtState.chaosFactor}/9 (${getChaosDescription(
        storyData.agmtState.chaosFactor
      )})
- Scene Count: ${storyData.agmtState.sceneCount}
- Active Threads: ${
        storyData.agmtState.threads.filter((t) => t.status === "active").length
      }/${storyData.agmtState.threads.length}
- Active NPCs: ${
        storyData.agmtState.characters.filter((c) => c.status === "active")
          .length
      }/${storyData.agmtState.characters.length}

### Threads
${
  storyData.agmtState.threads
    .filter((t) => t.status === "active")
    .map((t) => `- [Active] ${t.description} (ID: ${t.id})`)
    .join("\n") || "(none)"
}
${
  storyData.agmtState.threads
    .filter((t) => t.status === "closed")
    .map((t) => `- [Closed] ${t.description} (ID: ${t.id})`)
    .join("\n") || ""
}

### NPCs
${
  storyData.agmtState.characters
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

  // Build active challenge section if one exists
  const activeChallengeSection = storyData.activeChallenge?.active
    ? (() => {
        const majority = Math.ceil(storyData.activeChallenge.rounds / 2);
        return `## 🎯 ACTIVE CHALLENGE: ${storyData.activeChallenge.name}
- **Format:** Best of ${
          storyData.activeChallenge.rounds
        } (first to ${majority} wins)
- **Score:** ${storyData.activeChallenge.currentSuccesses} - ${
          storyData.activeChallenge.currentFailures
        }
- **Victory Reward:** ${
          storyData.activeChallenge.pointsAwarded || 0
        } progression points
${
  storyData.activeChallenge.description
    ? `- **Situation:** ${storyData.activeChallenge.description}`
    : ""
}`;
      })()
    : "";

  // Build rest state section - show available rests
  const difficulty = storyData.difficulty || "medium";
  const restConfig = REST_CONFIG[difficulty];
  const restState = storyData.restState || {
    quickRestsUsed: 0,
    shortRestsUsed: 0,
  };
  const remainingQuick = restConfig.maxQuickRests - restState.quickRestsUsed;
  const remainingShort = restConfig.maxShortRests - restState.shortRestsUsed;

  // Only show rest section if rests are limited (not all available)
  const restStateSection =
    restState.quickRestsUsed > 0 || restState.shortRestsUsed > 0
      ? `## Rest Availability
- Quick Rests: ${remainingQuick}/${restConfig.maxQuickRests} remaining
- Short Rests: ${remainingShort}/${restConfig.maxShortRests} remaining
${
  remainingQuick === 0 && remainingShort === 0
    ? "⚠️ Long rest required to restore rest uses"
    : ""
}`
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
    passivesSection,
    achievementsSection,
    loreSection,
    memorySection,
    relationshipsSection,
    conditionsSection,
    questsSection,
    variablesSection,
    activeChallengeSection,
    restStateSection,
    agmtSection,
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
        } (spend for advantage/guaranteed success)`
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
  usePrefill = true,
}: {
  storyData: StoryData;
  userChoice?: string;
  commandResponses?: CommandResponse[];
  modelName?: string;
  customMaxContext?: number;
  embeddingContext?: EmbeddingContext;
  usePrefill?: boolean;
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

  const systemPrompt = `You are a creative narrative engine for a high-fidelity interactive text adventure.
Your role is to write ONLY the story prose.
The Input will provide the "Action Result" (Success/Failure). You describe the outcome.

## 1. CORE WRITING PRINCIPLES
- **Show, Don't Tell:** Ground abstract concepts in concrete sensory details (lighting, texture, smell, sound).
    - *Bad:* "You feel afraid."
    - *Good:* "The hair on your arms stands up; the air tastes of ozone and copper."
- **Deep POV:** Write in strict SECOND PERSON ("You"). Immersive and immediate.
- **Word Choice:** Use precise verbs. Avoid generic words.
    - *Banned Words:* Testament, tapestry, dance of death, shivers down spine, smirked.
    - *Structure:* Vary sentence length. Short sentences for action. Complex flow for atmosphere.

## 2. PLAYER AGENCY & STOPPING RULES
- **Protagonist:** The Player is the main character. NEVER write actions they didn't choose.
- **Stop Early:** When you reach a moment where the player must react, decide, or speak, end your response with [STOP].
    - *Crucial:* Do not resolve the suspense. Do not write what the player does next.
    - *Example:* "The guard spins around, spotting you. 'Hey!' he shouts, reaching for his sword...[STOP]"
- **Unclear Input:** If the player's choice is vague, describe the situation and end with [STOP] for input.

## 3. THE ACTIVE WORLD (The World Breathes)
- **NPC Agency:** NPCs have agendas. They do not just wait for the player to speak. They interrupt, they leave, they pursue goals.
- **Environment:** The world moves. Weather changes, crowds murmur, distant sounds occur.
- **No "Nothingburgers":** Avoid paragraphs that just restate the situation. Every response must ADVANCE the story (new info, world change, or dramatic development).

## 4. MECHANICS TRANSLATION
- **Success:** Show the competence and full impact of the action.
- **Failure (Fail Forward):** NEVER write "Nothing happens."
    - *Yes, but...* You succeed, but at a cost (injury, lost item, noise).
    - *No, and...* You fail, and the situation gets worse (guard alerted, weapon dropped).
- **Hidden Text:** Use ||double pipes|| for DM notes, foreshadowing, or secret NPC motives.

## 5. PACING & TONE
- **Combat/Action:** Fast, punchy, visceral. Focus on impact and movement.
- **Exploration:** Slower, atmospheric. Focus on sensory details and clues.
- **Dialogue:** Give NPCs distinct voices/mannerisms. Use subtext.

## 6. SCENE CHALLENGES (Best of X)
When an [ACTIVE CHALLENGE] is shown in the game state:
- **Early Game (0-1 on each side):** Describe the initial clash or the magnitude of the obstacle. Do NOT conclude the scene - the battle/chase/negotiation is just beginning.
- **Tense (close score, e.g., 2-2):** The outcome hangs in the balance. Build maximum tension - either side could win.
- **Momentum (one side ahead, e.g., 2-1):** Describe the tide turning. The leading side is gaining the upper hand, the trailing side is desperate.
- **Challenge Won:** Write the triumphant conclusion. The enemies lie defeated, the door swings open, the negotiation succeeds.
- **Challenge Lost:** Write the disaster/consequence. You are overwhelmed, captured, the enemy escapes, the negotiation collapses.
- **Keep It Episodic:** Each turn during a challenge should advance ONE step - do not skip ahead. Let the mechanics (the score) pace the resolution.

## 7. OUTPUT FORMAT
- **Markdown:** Use markdown sparingly for emphasis:
    - **Emphasis:** Use *italics* for internal thoughts, sounds, or whispers. Use **bold** for impactful moments.
    - **Breaks:** Use --- for dramatic pauses or perspective shifts within a scene.
    - **No Headers:** Do NOT use ## headers in your prose - save them for major scene changes only (rare).
- **No Meta-Text:** Do NOT write progress indicators, mechanical echoes, or UI labels like "Scene:", "Chapter:", "Progress 2/3".
- **No Mechanical Summaries:** Do NOT echo back the skill check results, item usage, or resource costs. Those are INPUT context - the player already saw the dice roll.
- **Stop Marker:** End your response with [STOP] when the player needs to react, decide, or speak next.

WRITE THE NARRATIVE RESPONSE ONLY!

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
  // Include GM state changes from previous turns so the AI knows what happened
  const historyMessages: ChatMessage[] = [];
  for (let i = 0; i < storyData.scene.parts.length; i++) {
    const part = storyData.scene.parts[i];
    if (part.user) {
      historyMessages.push({
        role: "user",
        content: cleanString(part.content),
      });
    } else {
      // For story generation, include the narrative content
      const assistantContent = part.raw || part.content;
      historyMessages.push({
        role: "assistant",
        content: cleanString(assistantContent),
      });

      // If this assistant part had state changes from tools, include them as a GM note
      // We use stateChanges (human-readable) rather than raw tool_calls to avoid confusing
      // the story AI with tool schemas it doesn't have access to
      if (part.stateChanges && part.stateChanges.length > 0) {
        const gmNote = `[GM State Update]\n${part.stateChanges
          .map((s) => `• ${s}`)
          .join("\n")}`;
        historyMessages.push({
          role: "assistant",
          content: cleanString(gmNote),
        });
      }
    }
  }

  // Add user choice to history if present
  if (userChoice) {
    let choiceMessage = `Player chose: ${userChoice}`;

    // Include pending player actions (level ups, skill tree purchases, etc.)
    if (
      storyData.pendingPlayerActions &&
      storyData.pendingPlayerActions.length > 0
    ) {
      const actionsNote = `[Player Actions Between Turns]\n${storyData.pendingPlayerActions
        .map((a) => `• ${a}`)
        .join("\n")}`;
      choiceMessage = `${actionsNote}\n\n${choiceMessage}`;
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
  // Strip markdown from older messages to save tokens and prevent AI oversaturation
  // Keep markdown only in the last 4 messages for immediate context
  const prunedHistory = historyMessages.slice(startIndex);
  const markdownThreshold = prunedHistory.length - 4;

  for (let i = 0; i < prunedHistory.length; i++) {
    const msg = prunedHistory[i];
    if (i < markdownThreshold && msg.role === "assistant") {
      // Strip markdown from older assistant messages
      messages.push({
        ...msg,
        content: stripMarkdown(msg.content),
      });
    } else {
      messages.push(msg);
    }
  }

  if (prunedParts > 0) {
    console.log(
      `[buildStoryPrompt] Pruned ${prunedParts} oldest parts to fit context budget. Kept ${prunedHistory.length} parts.`
    );
    console.log(
      `[buildStoryPrompt] Token budget: ${actualStoryBudget}, Used: ${currentTokens}, Info: ${infoTokens}`
    );
  }

  // Add role affirmation (prefill) if enabled
  // This primes the model to follow output constraints by appearing as if it already committed
  if (usePrefill) {
    messages.push({
      role: "assistant",
      content: STORY_AFFIRMATION,
    });
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
  usePrefill = true,
}: {
  storyData: StoryData;
  storyContent: string; // The story text just generated
  commandResponses?: CommandResponse[];
  existingToolCalls?: any[]; // Tool calls from previous iterations
  existingToolResponses?: CommandResponse[]; // Tool responses from previous iterations
  embeddingContext?: EmbeddingContext;
  usePrefill?: boolean;
}): { messages: ChatMessage[] } {
  const rpgSystem = getRPGSystem(storyData.rpgSystem || "3d6");

  const systemPrompt = `You are the Game State Manager.
Your role is to read the latest narrative output and ensure the Game Database matches the story exactly.

User will not see your output. Use your message content to "Think Step-by-Step" before calling tools.

## CRITICAL: Already-Processed Actions
Player messages may contain bracketed annotations like [Ability: Fireball], [Mana: -10], [Item: Health Potion], [Stealth: success].
**These indicate actions the GAME SYSTEM already processed** (dice rolled, resources deducted, items consumed).
DO NOT duplicate these changes. Only process NEW events from the STORY TEXT.

## ANALYSIS STEPS (Apply ONLY to the latest STORY TEXT)
1. **Inventory Audit:** Did the narrative imply an item was consumed (e.g., "quaffed the potion"), broken, given away, or picked up? -> \`add_item\` / \`remove_item\`
2. **Physiological Audit:** Did the player exert themselves, get hurt, or cast a spell in the text? -> \`update_resource\` (Health/Stamina/Mana).
3. **Condition Check:**
    - Did the player FAIL a check resulting in injury? -> \`add_condition\` (Tier I-VI).
    - Did the player receive medical aid or rest? -> \`downgrade_condition\`.
    - *Note:* Do not add conditions for "flavor" pain. Only for tactical disadvantages described in the story.
4. **Knowledge & Quests:** Did the player learn a name, a secret, or a location? -> \`add_memory\` / \`update_quest\`.
5. **Relationship Delta:** Did an NPC react positively or negatively? -> \`update_relationship\` (Small increments: +1/-1 for chat, +5/-5 for major deeds).
6. **Passive Traits:** Did the player gain or lose a defining trait through story events? -> \`add_passive\` / \`remove_passive\` / \`modify_passive\`.
    - Passives are story/RP traits that influence narrative (NOT mechanical bonuses)
    - Examples: "Wolf Slayer" (gained after defeating many wolves), "Cursed Blood" (gained through dark ritual), "Friend of the Forest" (earned trust of woodland creatures)
    - Only add passives for SIGNIFICANT character developments, not minor events

## TOOL USAGE GUIDELINES
- **Exact Matching:** You must use exact string matching for Item/Stat/Quest names.
- **Lore Triggers:** If the story mentions a keyword (e.g., "The Order of the Rose"), check if \`onTrigger\` exists for it.
- **Fail Forward:** If the narrative described a failure, ensure the *cost* of that failure is applied (lost resource, condition, etc.).

## LORE MANAGEMENT
- If the narrative introduces a NEW permanent concept/faction/NPC not in the database, call \`create_lore\`.
- If an existing hidden lore was triggered by a keyword, call \`show_lore\`.

## SCENE CHALLENGES (Progress Clocks)
Manage complex multi-step tasks using the Challenge Tools.

1. **Detecting New Challenges:**
   - If the narrative describes the START of a significant conflict (combat with multiple foes, a heist, a chase, a complex negotiation) AND no challenge is active -> Call \`start_challenge\`.
   - Guidelines:
     - Simple action (single enemy, locked door, quick conversation): Do NOT start a challenge - use regular skill checks.
     - Dangerous combat / chase / multi-step task: 3 successes / 3 failures.
     - Boss fight / war / major heist: 5+ successes needed.

2. **Updating Active Challenges:**
   - If a Challenge is ACTIVE and this turn involved a skill check:
     - Player succeeded at their action? -> \`update_challenge\` with \`successIncrement: 1\`
     - Player failed at their action? -> \`update_challenge\` with \`failureIncrement: 1\`
   - Do NOT update if no skill check was made this turn.

3. **Auto-Resolution (Best of X):**
   - Challenges automatically resolve when either side reaches majority:
     - First to \`Math.ceil(rounds / 2)\` wins. For Best of 5, first to 3.
   - Use \`resolve_challenge\` only for non-standard endings (enemy surrenders, rescue arrives, player retreats).

## REST SYSTEM
Allow players to rest and recover when narratively appropriate.

**Rest Types:**
- **Quick Rest (~30 min):** Brief break to catch breath. Recovers 5-15% resources, reduces cooldowns slightly. Use between encounters.
- **Short Rest (4-8 hours):** Sleep or extended rest. Recovers 30-60% resources, resets most cooldowns, heals minor conditions, repairs items slightly. Use at safe camps or inns.
- **Long Rest (several days):** Extended downtime/time skip. Full recovery, all cooldowns reset, conditions improve significantly, items fully repaired. Resets quick/short rest counters.

**When to Call \`take_rest\`:**
- Player explicitly requests rest, sleep, or recovery time
- Narrative reaches a natural pause (safe haven, end of major event, travel montage)
- Player is injured/exhausted and seeks shelter

**When NOT to Rest:**
- During active combat or challenges
- In immediate danger
- When quick/short rest limits are exhausted (player needs long rest)

**Long Rest Confirmation:**
Long rests involve a time skip of several days. The AI should narratively describe the passage of time and what happens during the rest period.

Think through the narrative sentence-by-sentence, then execute the required Tool Calls.

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

  // Add scene parts within token budget for context (INCLUDING PAST TOOL CALLS)
  const recentParts = getPartsWithinTokenBudget(
    storyData.scene.parts,
    TOOL_STAGE_TOKEN_BUDGET
  );
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

  // Add role affirmation (prefill) if enabled and no existing tool calls
  // For multi-round tool calling, we skip the affirmation after the first round
  if (usePrefill && (!existingToolCalls || existingToolCalls.length === 0)) {
    messages.push({
      role: "assistant",
      content: TOOLS_AFFIRMATION,
    });
  }

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
  usePrefill = true,
}: {
  storyData: StoryData;
  storyContent: string; // The story text just generated
  embeddingContext?: EmbeddingContext;
  usePrefill?: boolean;
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

🌟 PASSIVE TRAITS (influence difficulty and narrative):
${(() => {
  const passivesList = getActivePassives(storyData);
  return passivesList.length > 0
    ? passivesList.map((p) => `• ${p.name}: ${p.description}`).join("\n")
    : "• (No passive traits)";
})()}

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
- When a choice uses a resource (use_resource), it signifies that action requires or risks that resource
- Choose resources that thematically fit the action: use Stamina for running/escaping, Health for combat/dangerous situations, Mana for spellcasting, etc.
- Resource requirements are based on DC:
  * Required amount: DC ÷ ${
    rpgSystem.resources.requiredDivisor
  } (rounded down, minimum ${rpgSystem.resources.minRequired})
  * If player has insufficient resource: dice roll receives -DC÷${
    rpgSystem.resources.penaltyDivisor
  } penalty (minimum -${rpgSystem.resources.minPenalty})
- YOU manage all resource gains and losses via tools (adjust_resource, set_resource) based on narrative outcomes
- Example: A player sprints to escape - on failure, YOU might deduct Stamina; on success, YOU decide if they're winded or energized

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
    storyData.agmtState
      ? `

⚠️ MYTHIC QUESTIONS vs SKILL CHECKS - STRICT HIERARCHY:

1. SKILL CHECKS DETERMINE SUCCESS/FAILURE - Their result is FINAL and CANNOT be overridden
   - If a choice has skill_used parameter, the skill check result determines whether the player succeeds
   - Success = player accomplishes the action
   - Failure = player fails at the action
   - DO NOT ask AGMT questions that duplicate or "second guess" the skill check outcome

2. MYTHIC QUESTIONS are for situations where SKILL CHECKS DON'T ANSWER THE QUESTION:
   
   ✅ GOOD USE CASES (asking questions skill checks can't answer):
   - World discovery: "Is the artifact here? (Unlikely)" "Is the door locked? (50/50)"
   - NPC state: "Is the merchant friendly? (Somewhat Likely)" "Does the guard recognize you? (Unlikely)"
   - Environmental factors: "Is the path clear? (Likely)" "Is it raining? (50/50)"
   - Complications: "Does something go wrong? (Likely)" [adds narrative tension]
   - Opportunities: "Is there another way? (50/50)" [offers alternatives]
   - Random events: Use Event Meaning for unexpected developments
   
   ✅ GOOD COMBINATIONS (skill + agmt asking DIFFERENT questions):
   "Search the ruins [Perception DC 12] [agmt: Is anything valuable here? (Unlikely) (context)]"
   → Perception check = Can you find what's there (player ability)
   → AGMT = What's actually there to find (world state)
   → Set agmt_context_only: true
   
   "Convince the guard [Diplomacy DC 15] [agmt: Is the guard corrupt? (50/50) (context)]"
   → Diplomacy = Your persuasion skill (player ability)
   → AGMT = Guard's moral flexibility (NPC trait)
   → Set agmt_context_only: true
   
   "Sneak past patrols [Stealth DC 18] [agmt: Are guards alert? (Likely) (context)]"
   → Stealth = Your sneaking ability (player ability)
   → AGMT = Environmental difficulty (world state)
   → Set agmt_context_only: true
   
   ❌ BAD USE CASES (redundant with skill check - NEVER DO THIS):
   "Climb the wall [Athletics DC 14] [agmt: Can you reach the top? (Somewhat Likely)]"
   ❌ WRONG: Both determine if you climb successfully - AGMT duplicates skill check
   
   "Persuade the king [Diplomacy DC 18] [agmt: Does the king agree? (Likely)]"
   ❌ WRONG: Diplomacy already answers if you persuade him - AGMT overrides skill check
   
   "Decode the runes [Intelligence DC 16] [agmt: Can you understand it? (50/50)]"
   ❌ WRONG: Intelligence determines comprehension - AGMT second-guesses the result

3. WHEN COMBINING BOTH:
   - ALWAYS set agmt_context_only: true when using agmt_check with skill_used
   - Skill check determines if PLAYER ACTION succeeds (primary outcome)
   - AGMT determines WORLD RESPONSE or CONTEXT (narrative color)
   - Skill result takes absolute priority for success/failure
   - AGMT adds complications, opportunities, or environmental factors
   
   Example outcomes:
   - Skill Success + AGMT Yes = Clean success with favorable circumstances
   - Skill Success + AGMT No = Success despite unfavorable circumstances
   - Skill Failure + AGMT Yes = Failure with mitigating factors or silver lining
   - Skill Failure + AGMT No = Complete failure with additional complications

4. STANDALONE MYTHIC (no skill check):
   - Use for pure world-building, NPC reactions, environmental queries
   - No agmt_context_only flag needed (there's no skill check to contextualize)
   - Result directly affects narrative but doesn't test player ability

Advanced RPG Tools ORACLE TABLES:
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

  // Add scene parts within token budget for context
  const recentParts = getPartsWithinTokenBudget(
    storyData.scene.parts,
    CHOICES_STAGE_TOKEN_BUDGET
  );
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

  // Add role affirmation (prefill) if enabled
  if (usePrefill) {
    messages.push({
      role: "assistant",
      content: CHOICES_AFFIRMATION,
    });
  }

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

  // Build unified table list - custom tables first, then agmt tables
  const customTableNames = storyData.customTables?.map((t) => t.name) || [];
  const agmtTableNames = storyData.agmtState
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
  const hasAnyTables = customTableNames.length > 0 || agmtTableNames.length > 0;

  const systemPrompt = `You are the Game Mechanics Engine. Your job is to translate player intent into strict game logic.

INPUT: Player's raw text + Current Game State.
OUTPUT: A single valid JSON object.

CONTEXTUAL ANALYSIS RULES:
1.  **Stat Selection (skill_used):** Stats are character ATTRIBUTES for skill checks (e.g., Strength, Intelligence, Charisma). Pick the stat that best matches the action type.
2.  **Resource Consumption (resource_used):** Resources are EXPENDABLE POOLS like Stamina, Mana, Health, Sanity. If the action is physically/mentally taxing (sprinting, climbing, spellcasting), assign the relevant resource to be consumed.
3.  **Implicit Item Usage:** If the player implies using an item they have (e.g., "I shoot him" -> implies Bow/Gun), assign that item.
4.  **Implicit Ability Usage:** If the player describes using a skill/spell/technique they have (e.g., "I cast fireball", "I use my lockpicking expertise"), assign that ability. Only assign abilities that are READY (not on cooldown).
5.  **Skill Continuity:** If the player *just* succeeded at a check (see history), do NOT call for a new check for the same continuous action. Set \`is_plain_action: true\`.
6.  **No God-Moding:** If the player attempts an impossible action (flying without wings), set \`is_plain_action: false\` but \`skill_used: null\` (The story engine will handle the narrative failure).

KEY DISTINCTION - STATS vs RESOURCES:
- STATS = Character attributes used for SKILL CHECKS. They do NOT get consumed. (e.g., Strength, Dexterity, Intelligence, Charisma, Perception)
- RESOURCES = Expendable pools that get SPENT when doing actions. (e.g., Stamina, Mana, Health, Energy, Sanity, Gold)

JSON STRUCTURE:
{
  "action_summary": "Objective description of intent (e.g., 'Attack guard with Longsword')",
  "skill_used": "Exact Stat Name" OR null,
  "skill_dc": Tier name ("trivial" | "easy" | "average" | "hard" | "very_hard" | "impossible") OR null,
  "stat_bonus": Number OR null (bonus/penalty to the stat value, e.g., +10 from terrain advantage, -5 from injury),
  "item_used": "Exact Item Name" OR null,
  "ability_used": "Exact Ability Name" OR null,
  "resource_used": "Exact Resource Name" OR null,
  "agmt_check": "Question (Likelihood)" OR null,
  "table": "Table Name" OR null,
  "is_plain_action": Boolean (true = dialogue/looking/flavor, false = mechanic needed),
  "challenge_handling": {
    "is_complex_event": Boolean (true = multi-step task like combat with group, chase, heist),
    "challenge_name": "Descriptive name" OR null (e.g., "Battle with the Bandits", "Escape the Collapsing Mine")
  },
  "rolls": [ { "dice": "1d4", "description": "How many guards are present" } ] OR null (contextual dice rolls for the scene)
}

DC TIER GUIDELINES:
- "trivial": Routine task, almost automatic
- "easy": Simple challenge, most succeed
- "average": Standard difficulty, 50/50 chance  
- "hard": Significant challenge, skill required
- "very_hard": Extreme difficulty, only skilled succeed
- "impossible": Near-impossible, requires exceptional luck

COMPLEX EVENTS VS SIMPLE ACTIONS:
- If the player attempts something HUGE that cannot resolve in one roll (e.g., "Fight the whole bandit camp", "Climb the infinite tower", "Convince the King to abdicate"), do NOT resolve it in one roll.
- Set \`challenge_handling.is_complex_event: true\` and provide a \`challenge_name\`.
- If a Challenge is ALREADY ACTIVE (see game state), this action is just a "step" in that challenge - set \`is_complex_event: false\`.

STAT BONUS RULES:
- Use \`stat_bonus\` when situational factors modify the character's effective skill level (NOT difficulty).
- Positive bonus: High ground, favorable terrain, enemy distracted, magical enhancement.
- Negative penalty: Darkness, slippery surface, wounded arm, fear effect.
- This adjusts the STAT VALUE before calculating the modifier, not the DC.
- Example: Fighting with high ground gives +10 to the stat, not -10 to DC.

CONTEXT ROLLS:
- Use \`rolls\` when the scene needs random elements determined BEFORE the action resolves.
- Examples: "How many enemies?" (1d4), "How much treasure?" (2d6 x 10 gold), "Distance to cover" (1d20 x 5 feet).
- These rolls add narrative texture and are reported to the player with the action result.
- Standard dice: d4, d6, d8, d10, d12, d20, d100. Can include modifiers (1d6+2).

DECISION PRIORITY:
1. Is this just dialogue or looking around? -> \`is_plain_action: true\`
2. Is the player trying to overcome an obstacle or opponent? -> Set \`skill_used\` + \`skill_dc\`.
3. Does the situation grant bonuses/penalties? -> Set \`stat_bonus\`.
4. Does the scene need random context? -> Add to \`rolls\` array.
5. Is it an AGMT (Oracle) question? (e.g., "Is the door locked?") -> Set \`agmt_check\`.
6. Is it a random discovery? (e.g., "Loot the body") -> Set \`table\`.
7. Is it a BIG multi-step task? -> Set \`challenge_handling.is_complex_event: true\`.

AVAILABLE DATA:
STATS (for skill_used - pick one for skill checks): ${
    storyData.stats.map((s) => s.name).join(", ") || "None"
  }
RESOURCES (for resource_used - expendable pools): ${
    storyData.resources
      .map((r) => `${r.name} (${r.value}/${r.maxValue})`)
      .join(", ") || "None"
  }
ITEMS (for item_used): ${
    storyData.inventory.map((i) => i.name).join(", ") || "None"
  }
ABILITIES (for ability_used): ${
    storyData.abilities?.length
      ? storyData.abilities
          .map((a) => {
            const readyStatus =
              (a.currentCooldown || 0) > 0
                ? `(on cooldown ${a.currentCooldown}/${a.cooldown})`
                : "(ready)";
            const costInfo = a.cost?.length
              ? ` [costs: ${a.cost
                  .map((c) => `${c.amount} ${c.name}`)
                  .join(", ")}]`
              : "";
            return `${a.name} ${readyStatus}${costInfo}`;
          })
          .join(", ")
      : "None"
  }
PASSIVE TRAITS (influence DC): ${(() => {
    const passivesList = getActivePassives(storyData);
    return passivesList.length > 0
      ? passivesList.map((p) => `${p.name} (${p.description})`).join(", ")
      : "None";
  })()}
ACTIVE CHALLENGE: ${
    storyData.activeChallenge?.active
      ? `"${storyData.activeChallenge.name}" (Best of ${storyData.activeChallenge.rounds}: ${storyData.activeChallenge.currentSuccesses}-${storyData.activeChallenge.currentFailures})`
      : "None"
  }

RESPOND WITH JSON ONLY.`;

  // Build minimal context within token budget for situational awareness
  const recentParts = getPartsWithinTokenBudget(
    storyData.scene.parts,
    ACTION_ANALYSIS_TOKEN_BUDGET
  );
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
