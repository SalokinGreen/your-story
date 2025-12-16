import {
  StoryData,
  Choice,
  CommandResponse,
  StoryLore,
  REST_CONFIG,
  getMemoryContent,
  CombatState,
  Combatant,
  CountdownTimer,
} from "@/app/misc/structs";
import { formatResponsesForAI } from "@/app/misc/commandResponses";
import { getModelConfig } from "@/app/misc/ai_prices";

export type ChatMessage = {
  role: "system" | "user" | "assistant" | "tool";
  content: string;
  tool_calls?: any[];
  tool_call_id?: string;
};

// Storyteller mode: "narrator" (literary prose) vs "dm" (game master with inline mechanics)
export type StorytellerMode = "narrator" | "dm";

// ============================================
// ROLE AFFIRMATION MESSAGES (Prefills)
// ============================================
// These "fake" assistant messages prime the model to follow output constraints
// by making it appear the model has already committed to the rules.

// Story affirmation is now dynamic - built with GM thinking as reasoning block
// The GM's reasoning appears in <thinking> tags like a reasoning model's internal process
export const STORY_AFFIRMATION_TEMPLATE = `<thinking>
{{GM_REASONING}}
</thinking>

I am the NARRATOR. The GAME MASTER has determined the outcome. Now I write the story.
`;

// Fallback when no GM reasoning is available
// NOTE: Must end with same marker as STORY_AFFIRMATION_TEMPLATE for consistent stripping
export const STORY_AFFIRMATION_FALLBACK = `I am the NARRATOR. No mechanical resolution was needed this turn. Now I write the story.
`;

/**
 * Build the story stage prefill with GM reasoning as a "thinking" block
 * This mimics reasoning model behavior where the AI processes internally before responding
 *
 * @param gmInterleavedConversation - Full interleaved GM conversation (preferred)
 * @param gmThinking - Array of GM thinking blocks (legacy fallback)
 * @param gmStoryContext - Tool results and summary (legacy fallback)
 */
export function buildStoryAffirmation(
  gmInterleavedConversation?: string,
  gmThinking?: string[],
  gmStoryContext?: string
): string {
  let gmReasoning = "";

  // NEW: Use interleaved conversation if available (preferred)
  if (gmInterleavedConversation) {
    gmReasoning = gmInterleavedConversation;
  } else {
    // LEGACY FALLBACK: Combine gmThinking + gmStoryContext
    const parts: string[] = [];

    if (gmThinking && gmThinking.length > 0) {
      const formattedThinking = gmThinking
        .map((t) => {
          const trimmed = t.trim();
          // Normalize [GM] to [GAME MASTER]
          return trimmed.startsWith("[GM]")
            ? trimmed.replace(/^\[GM\]/, "[GAME MASTER]")
            : trimmed;
        })
        .join("\n\n");
      parts.push(formattedThinking);
    }

    if (gmStoryContext) {
      // Normalize headers
      const formattedContext = gmStoryContext.startsWith("[GM")
        ? gmStoryContext.replace(/^\[GM[^\]]*\]/, "[GAME MASTER]")
        : gmStoryContext;
      parts.push(formattedContext);
    }

    gmReasoning = parts.join("\n\n");
  }

  // If no GM reasoning, use fallback
  if (!gmReasoning.trim()) {
    return STORY_AFFIRMATION_FALLBACK;
  }

  // Clean up the reasoning:
  // 1. Strip any existing <thinking> tags (we'll wrap in our own)
  //    Handle spaces inside tags like < thinking > that some models output
  // 2. Remove [GAME MASTER] headers (redundant in prefill context)
  // 3. Remove [STORY OUTPUT] markers (we want the prose to flow)
  // 4. Remove [GM made X tool call(s)] markers
  let cleanedReasoning = gmReasoning
    .replace(/<\s*thinking\s*>/gi, "")
    .replace(/<\s*\/\s*thinking\s*>/gi, "")
    .replace(/^\s*\[GAME MASTER\]\s*\n?/gim, "")
    .replace(/^\s*\[GM\]\s*\n?/gim, "")
    .replace(/^\s*\[STORY OUTPUT\]\s*\n?/gim, "")
    .replace(/^\s*\[GM made \d+ tool call\(s\):[^\]]*\]\s*\n?/gim, "")
    .replace(/\n{3,}/g, "\n\n")
    .trim();

  // Build the prefill with GM reasoning in thinking tags
  return STORY_AFFIRMATION_TEMPLATE.replace(
    "{{GM_REASONING}}",
    cleanedReasoning
  );
}

export const TOOLS_AFFIRMATION = `Understood. I will audit the narrative for game state changes:
- **Accuracy:** I will use EXACT string matching for items, stats, and quest names.
- **Already Applied:** Bracketed annotations like [Item Used: X], [Mana: -10], [Health: -15] mean those changes ALREADY HAPPENED. I will NOT duplicate them.

⚠️ CRITICAL: I MUST call ALL necessary tools in THIS SINGLE RESPONSE. I will NOT stop after one tool - I will call 2, 3, 4, or more tools together if multiple changes are needed.

Based on the narrative, here are the game state changes I will execute NOW (calling all tools in parallel):`;

export const CHOICES_AFFIRMATION = `Understood. I will generate player choices following these rules:
- **Format:** Plain list with dashes, one choice per line.
- **Mechanics:** Use exact stat/resource/item names from game state.
- **Balance:** Include safe options and risky-but-rewarding options.
- **No Repeat Rolls:** Avoid re-testing the same skill check that just resolved.

Generating choices:`;

// ============================================
// FEW-SHOT EXAMPLES
// ============================================
// These example exchanges teach the model the expected format at the start of a story
// when there's little context to learn from. We show a complete mini-playthrough.

const FEW_SHOT_INFO_MESSAGE = `# Story: The Merchant's Gambit
A cunning merchant navigates a dangerous bazaar.

## Character (Merchant)
- Agility: Good (+2)
- Persuasion: Average (+0)
- Perception: Fair (+1)
- Gold: 50/100`;

// GAME MASTER reasoning examples - demonstrating deep chain-of-thought reasoning
const FEW_SHOT_GM_REASONING_1 = `[GAME MASTER]
**1. UNDERSTANDING THE ACTION**
The player wants to search for the stolen amulet at the merchant's stall. They're not trying to steal it yet—just locate it. This is primarily a perception/search action.

**2. ASSESSING DIFFICULTY & CONTEXT**
- The marketplace is crowded with distractions (people, noise, goods)
- The amulet is hidden but not professionally concealed—a fence trying to sell it discreetly
- Player has Perception: Fair (+1), which is decent for this task
- Difficulty: Average—the amulet IS there, and the player is specifically looking for it

**3. CONSIDERING OUTCOMES**
- Success: Player spots the amulet. But this creates tension—they know where it is, but can't just grab it.
- Failure: Player doesn't find it here... or perhaps finds something that suggests it was moved elsewhere.
- Complications either way: The merchant Farouk is cunning. Those robed figures have been tailing the player.

**4. PLANNING CONSEQUENCES**
If successful, I'll plant seeds for the next decision: the merchant is suspicious, the robed figures are closing in. The player will need to decide how to actually retrieve the amulet.`;

const FEW_SHOT_GM_TOOLS_1 = `[GAME MASTER]
[Perception Check: 3d6 → 12 + 1 (stat) = 13 vs DC 10 (average) → SUCCESS (margin: +3)]
[Reason: Search for the stolen amulet at the stall]
[Stakes: low]

[Summary: Perception check succeeded by +3. The player spots the amulet hidden under silk. However, the merchant Farouk notices their interest, and two suspicious robed figures are approaching.]
[Outcome: success]
[Narrative Hooks: Farouk's knowing smile, the flash of silver under silk, robed figures with hands beneath cloaks]`;

const FEW_SHOT_STORY_EXAMPLE_1 = {
  gmReasoning: FEW_SHOT_GM_REASONING_1,
  gmTools: FEW_SHOT_GM_TOOLS_1,
  user: `[PLAYER] I'll check the merchant's stall for the stolen amulet.`,
  userWithContext: `[PLAYER] I'll check the merchant's stall for the stolen amulet.

${FEW_SHOT_GM_REASONING_1}

${FEW_SHOT_GM_TOOLS_1}`,
  assistant: `The spice merchant's stall reeks of cinnamon and something fouler—old sweat, perhaps, or fear. You run your fingers along the edge of a brass tray, pretending to inspect the saffron threads while your eyes scan the shadows beneath the counter.

*There.*

A glint of silver catches the lamplight. The amulet—your client's family heirloom—lies half-hidden beneath a bolt of silk, its sapphire eye winking at you like a shared secret.

The merchant notices your stillness. His smile doesn't reach his eyes. "Something catch your interest, friend?"

Behind you, the crowd's murmur shifts. Two men in dark robes have stopped at the neighboring stall, their gazes too casual, too fixed.
[STOP]`,
  stateChanges: [
    "Memory added: The stolen amulet is at Farouk's spice stall, hidden under silk",
    "Lore updated: Added details about Farouk's suspicious behavior",
  ],
};

const FEW_SHOT_GM_REASONING_2 = `[GAME MASTER]
**1. UNDERSTANDING THE ACTION**
The player wants to distract Farouk and snatch the amulet. This is a two-part action: social deception (distraction) followed by theft (grab). Given the tension, I'll focus on the critical first part—if the distraction fails, the grab never happens.

**2. ASSESSING DIFFICULTY & CONTEXT**
- Farouk is already suspicious—he noticed the player's interest in that spot under the silk
- The robed figures are closing in, adding time pressure
- Player has Persuasion: Average (+0), which is mediocre for fooling an alert, experienced merchant
- Difficulty: Hard—Farouk is on guard and the stakes are high

**3. CONSIDERING OUTCOMES**
- Success: The distraction works, giving a brief window to grab the amulet. But then what? The robed figures will still react.
- Failure: Farouk sees through the ploy immediately. His reaction should be physical and threatening—merchants in this bazaar don't survive by being passive.

**4. PLANNING CONSEQUENCES**
On failure, I want to escalate WITHOUT ending the scene. Farouk grabs the player (they're caught but not defeated). This creates a tense standoff with multiple escape routes (negotiation, violence, escape). The player still has agency.`;

const FEW_SHOT_GM_TOOLS_2 = `[GAME MASTER]
[Persuasion Check: 3d6 → 7 + 0 (stat) = 7 vs DC 14 (hard) → FAILURE (margin: -7)]
[Reason: Distract the merchant to create opportunity for theft]
[Stakes: medium]

[Summary: Persuasion failed by 7. Farouk saw through the distraction instantly and physically restrained the player. Two armed figures approaching. Standoff situation with multiple escape options visible.]
[Outcome: failure]
[Narrative Hooks: Farouk's cobra-fast grab, the hiss of accusation, dagger at hip, melon cart blocking exit, rooftops as escape route]`;

const FEW_SHOT_STORY_EXAMPLE_2 = {
  gmReasoning: FEW_SHOT_GM_REASONING_2,
  gmTools: FEW_SHOT_GM_TOOLS_2,
  user: `[PLAYER] Distract the merchant and grab the amulet.`,
  userWithContext: `[PLAYER] Distract the merchant and grab the amulet.

${FEW_SHOT_GM_REASONING_2}

${FEW_SHOT_GM_TOOLS_2}`,
  assistant: `"Those saffron threads," you say, gesturing to the upper shelf. "Are they from the southern provinces? The color seems—"

Farouk's hand shoots out, faster than a striking cobra. His fingers close around your wrist like a vice.

"You think me a fool?" His voice drops to a hiss. The crowd noise swallows his words, but his grip doesn't waver. "I know what you're reaching for, *thief*."

The two robed figures are moving now, cutting through the crowd with purpose. One of them has a hand beneath his cloak.

Your curved dagger presses against your hip. The exit is three stalls away, blocked by a cart of melons. The rooftops—if you could reach them—offer another path.

Farouk's grip tightens. "Now. We talk price. Or we talk to the Caliph's men."
[STOP]`,
  stateChanges: [
    "Condition added: Compromised Position (Tier I) - Farouk has you by the wrist",
  ],
};

// Few-shot tool calls example (showing the tool calling format)
const FEW_SHOT_TOOL_CALLS = [
  {
    id: "ex1",
    type: "function" as const,
    function: {
      name: "add_memory",
      arguments: JSON.stringify({
        entry:
          "The stolen amulet is hidden at Farouk's spice stall, beneath silk bolts",
      }),
    },
  },
  {
    id: "ex2",
    type: "function" as const,
    function: {
      name: "modify_momentum",
      arguments: JSON.stringify({
        amount: 1,
        reason: "Quick thinking and improvisation in a tense situation",
      }),
    },
  },
];

const FEW_SHOT_TOOL_RESPONSES = [
  {
    toolCallId: "ex1",
    success: true,
    message:
      'Memory added: "The stolen amulet is hidden at Farouk\'s spice stall, beneath silk bolts"',
  },
  {
    toolCallId: "ex2",
    success: true,
    message:
      "Momentum increased by 1 → 2 (Quick thinking and improvisation in a tense situation)",
  },
];

// ============================================
// DM MODE FEW-SHOT EXAMPLES
// ============================================
// These examples show the "Dungeon Master" storytelling style where
// mechanics are woven into the narrative with clear roll announcements

const DM_FEW_SHOT_STORY_EXAMPLE_1 = {
  gmReasoning: FEW_SHOT_GM_REASONING_1,
  gmTools: FEW_SHOT_GM_TOOLS_1,
  user: `[PLAYER] I'll check the merchant's stall for the stolen amulet.`,
  userWithContext: `[PLAYER] I'll check the merchant's stall for the stolen amulet.

${FEW_SHOT_GM_REASONING_1}

${FEW_SHOT_GM_TOOLS_1}`,
  assistant: `The spice merchant's stall reeks of cinnamon and something fouler—old sweat, perhaps, or fear.

**Perception check to spot the hidden amulet... you rolled a 12, plus your +1 bonus = 13 against DC 10. Success!**

Your trained eye catches what others would miss. There—beneath that bolt of silk, a flash of silver. The amulet, your client's family heirloom, its sapphire eye winking in the lamplight.

But Farouk noticed you noticing. His smile doesn't reach his eyes.

"Something catch your interest, friend?"

Behind you, two men in dark robes have stopped at the neighboring stall. Their gazes are too casual, too fixed.

*You've found the amulet, but you're not the only one watching.*
[STOP]`,
  stateChanges: [
    "Memory added: The stolen amulet is at Farouk's spice stall, hidden under silk",
    "Lore updated: Added details about Farouk's suspicious behavior",
  ],
};

const DM_FEW_SHOT_STORY_EXAMPLE_2 = {
  gmReasoning: FEW_SHOT_GM_REASONING_2,
  gmTools: FEW_SHOT_GM_TOOLS_2,
  user: `[PLAYER] Distract the merchant and grab the amulet.`,
  userWithContext: `[PLAYER] Distract the merchant and grab the amulet.

${FEW_SHOT_GM_REASONING_2}

${FEW_SHOT_GM_TOOLS_2}`,
  assistant: `"Those saffron threads," you say, gesturing to the upper shelf. "Are they from the southern provinces? The color seems—"

**Persuasion check to fool Farouk... you rolled a 7, no bonus. Against DC 14? That's a failure by 7.**

Farouk's hand shoots out like a striking cobra. His fingers close around your wrist like iron.

"You think me a fool?" His voice drops to a dangerous hiss. "I *know* what you're reaching for, thief."

The two robed figures are moving now—cutting through the crowd with purpose. One of them has a hand beneath his cloak.

**You've been caught. Farouk's got your wrist, and you've attracted unwanted attention.**

Your curved dagger presses against your hip. The exit is three stalls away, blocked by a cart of melons. The rooftops—if you could reach them—offer another path.

"Now," Farouk growls. "We talk price. Or we talk to the Caliph's men."

*What do you do?*
[STOP]`,
  stateChanges: [
    "Condition added: Compromised Position (Tier I) - Farouk has you by the wrist",
  ],
};

/**
 * Build few-shot example messages for the story stage
 * Shows the workflow: [PLAYER] action + [GAME MASTER] reasoning → story that honors both
 * @param mode - "narrator" for literary prose, "dm" for game master with inline mechanics
 */
export function buildStoryFewShotMessages(
  mode: StorytellerMode = "narrator"
): ChatMessage[] {
  // Select examples based on mode
  const example1 =
    mode === "dm" ? DM_FEW_SHOT_STORY_EXAMPLE_1 : FEW_SHOT_STORY_EXAMPLE_1;
  const example2 =
    mode === "dm" ? DM_FEW_SHOT_STORY_EXAMPLE_2 : FEW_SHOT_STORY_EXAMPLE_2;

  return [
    // Example info message
    { role: "user", content: FEW_SHOT_INFO_MESSAGE },
    // First turn - user choice with GAME MASTER context appended
    { role: "user", content: example1.userWithContext },
    { role: "assistant", content: example1.assistant },
    {
      role: "assistant",
      content: `[GAME MASTER State Update]\n${example1.stateChanges
        .map((s) => `• ${s}`)
        .join("\n")}`,
    },
    // Second turn - user choice with GAME MASTER context appended
    { role: "user", content: example2.userWithContext },
    { role: "assistant", content: example2.assistant },
    {
      role: "assistant",
      content: `[GAME MASTER State Update]\n${example2.stateChanges
        .map((s) => `• ${s}`)
        .join("\n")}`,
    },
    // Transition to new story
    {
      role: "user",
      content:
        "--- END OF EXAMPLE ---\nNow let's begin a NEW story. The following info message describes the actual adventure:",
    },
  ];
}

/**
 * Build few-shot example messages for the tools stage
 * Only used when there's little context (< 3 scene parts)
 */
export function buildToolsFewShotMessages(): ChatMessage[] {
  return [
    // Example info message
    { role: "user", content: FEW_SHOT_INFO_MESSAGE },
    // Example story text that needs tool processing
    {
      role: "user",
      content: `Here is the latest story text to process:\n\n${FEW_SHOT_STORY_EXAMPLE_2.assistant}`,
    },
    // Example tool calls
    {
      role: "assistant",
      content:
        "Analyzing the narrative for game state changes:\n1. A memory should be added about the amulet's location\n2. Nazim noticed and is ready to help - this is a significant moment worth recording\n3. Good progress on the quest\n\nCalling tools:",
      tool_calls: FEW_SHOT_TOOL_CALLS,
    },
    // Tool responses
    ...FEW_SHOT_TOOL_RESPONSES.map((r) => ({
      role: "tool" as const,
      tool_call_id: r.toolCallId,
      content: `${r.success ? "✓" : "✗"} ${r.message}`,
    })),
    // Acknowledgment
    {
      role: "assistant",
      content: "Game state updated. All changes processed successfully.",
    },
    // Transition to actual story
    {
      role: "user",
      content:
        "--- END OF EXAMPLE ---\nNow process the ACTUAL story. The following info message shows the real game state:",
    },
  ];
}

// Threshold for using few-shot examples (when scene has fewer parts than this)
export const FEW_SHOT_THRESHOLD = 10;

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
// GM Stage uses customMaxContext (Memory Size slider) - it does the heavy lifting
// Story Stage uses fixed smaller budget - it's just a translator now
export const TOOL_STAGE_TOKEN_BUDGET = 12000; // ~12k tokens for tool stage history
export const CHOICES_STAGE_TOKEN_BUDGET = 4000; // ~4k tokens for choices stage history
export const ACTION_ANALYSIS_TOKEN_BUDGET = 4000; // ~4k tokens for action analysis (legacy)
export const STORY_STAGE_TOKEN_BUDGET = 16000; // ~16k fixed budget for story stage (translator mode)
export const GM_STAGE_DEFAULT_BUDGET = 36000; // Default GM context if no customMaxContext set

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

/**
 * Format combat state for AI context
 */
export function formatCombatState(
  combatState: CombatState | undefined
): string {
  if (!combatState?.active) return "";

  const lines: string[] = [];
  lines.push(`## ⚔️ ACTIVE COMBAT: ${combatState.name || "Combat"}`);
  lines.push(`**Round:** ${combatState.round}`);

  // Current turn
  const currentId = combatState.turnOrder[combatState.currentTurnIndex];
  const currentCombatant = combatState.combatants.find(
    (c) => c.id === currentId
  );
  if (currentCombatant) {
    lines.push(
      `**Current Turn:** ${currentCombatant.name} (${currentCombatant.type})`
    );
  }

  lines.push("");
  lines.push("### COMBATANTS");

  // Group by type
  const byType: Record<string, Combatant[]> = {
    player: [],
    ally: [],
    enemy: [],
    neutral: [],
  };

  for (const c of combatState.combatants) {
    byType[c.type].push(c);
  }

  for (const [type, combatants] of Object.entries(byType)) {
    if (combatants.length === 0) continue;

    lines.push(`\n**${type.charAt(0).toUpperCase() + type.slice(1)}s:**`);
    for (const c of combatants) {
      const status = c.isActive ? "" : " [INACTIVE]";
      const statsStr = Object.entries(c.stats)
        .map(([k, v]) => `${k}: ${v}`)
        .join(", ");
      const conditionsStr =
        c.conditions.length > 0
          ? ` | Conditions: ${c.conditions
              .map((cond) =>
                cond.duration ? `${cond.name}(${cond.duration}t)` : cond.name
              )
              .join(", ")}`
          : "";
      const initStr =
        c.initiativeRoll !== undefined ? ` [Init: ${c.initiativeRoll}]` : "";
      lines.push(`- ${c.name}${status}: ${statsStr}${conditionsStr}${initStr}`);
      if (c.notes) {
        lines.push(`  Notes: ${c.notes}`);
      }
    }
  }

  lines.push("");
  lines.push("### INITIATIVE ORDER");
  const activeOrder = combatState.turnOrder
    .map((id, idx) => {
      const c = combatState.combatants.find((cb) => cb.id === id);
      if (!c || !c.isActive) return null;
      const marker = idx === combatState.currentTurnIndex ? "→ " : "  ";
      return `${marker}${c.name} (${c.initiativeRoll ?? "?"})`;
    })
    .filter(Boolean);
  lines.push(activeOrder.join("\n"));

  // Recent combat log
  if (combatState.log && combatState.log.length > 0) {
    lines.push("");
    lines.push("### RECENT COMBAT LOG");
    const recentLog = combatState.log.slice(-10);
    lines.push(recentLog.join("\n"));
  }

  return lines.join("\n");
}

/**
 * Format countdown timers for AI context
 */
export function formatTimersState(
  timers: CountdownTimer[] | undefined
): string {
  if (!timers || timers.length === 0) return "";

  // Only show active or paused timers (not triggered/cancelled)
  const activeTimers = timers.filter(
    (t) => t.status === "active" || t.status === "paused"
  );
  if (activeTimers.length === 0) return "";

  const lines: string[] = [];
  lines.push(`## ⏱️ ACTIVE TIMERS`);

  for (const timer of activeTimers) {
    const statusIcon = timer.status === "paused" ? "⏸️" : "⏰";
    const advanceNote = timer.autoAdvance ? " (auto)" : " (manual)";
    const visibilityNote = timer.visibility === "hidden" ? " [HIDDEN]" : "";

    lines.push(
      `${statusIcon} **${timer.name}**: ${timer.currentTicks}/${timer.totalTicks} ticks${advanceNote}${visibilityNote}`
    );
    if (timer.description) {
      lines.push(`   → When triggered: ${timer.description}`);
    }
  }

  return lines.join("\n");
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

// Helper to convert stat percentage values to descriptive words
function getStatDescriptor(value: number): string {
  if (value <= 10) return "abysmal";
  if (value <= 20) return "very low";
  if (value <= 35) return "low";
  if (value <= 45) return "below average";
  if (value <= 55) return "average";
  if (value <= 65) return "above average";
  if (value <= 80) return "high";
  if (value <= 90) return "very high";
  return "exceptional";
}

// Build info message for GM Stage
// Note: Stats, resources, abilities, and rpgSystem are DEPRECATED.
// All mechanics are now defined in "mechanics" type lore entries and handled by GM stage formula_roll.
// AGENTIC NOTE SYSTEM:
// - Pinned types (dm_instructions, character_sheet, mechanics): Always loaded in full
// - Folder types (lore, secret): Show titles only, use read_notes tool
// - story_instructions: NOT included here (only used by Story Stage)
export function buildInfoMessage(
  storyData: StoryData,
  embeddingContext?: EmbeddingContext // DEPRECATED - kept for backward compat but ignored
): string {
  // Build achievements section - show LOCKED achievements with ai_hint
  const lockedAchievements = storyData.achievements.filter(
    (a) => !a.dateAchieved
  );
  const achievementsSection = lockedAchievements.length
    ? `## Locked Achievements\n${lockedAchievements
        .map((a) => `- ${a.title}: ${a.ai_hint || a.description}`)
        .join("\n")}`
    : "";

  // ============================================
  // AGENTIC NOTE SYSTEM - Folder-based approach
  // ============================================
  // GM Stage pinned types: dm_instructions, character_sheet, mechanics
  // Story Stage pinned types: story_instructions, character_sheet (see buildStoryInfoMessage)
  // Folder types: lore, secret (show titles only, use read_notes tool)

  // Helper to check if a note type is "pinned" for GM Stage (always loaded in full)
  // NOTE: mechanics is NO LONGER pinned - it uses read_notes like other folders
  const isPinnedType = (type?: string): boolean => {
    return (
      type === "dm_instructions" ||
      type === "character_sheet" ||
      type === "gm_notes" // Legacy alias for dm_instructions
      // NOTE: mechanics and story_instructions are NOT pinned for GM Stage
    );
  };

  // Helper to check if a note type should be excluded from World Lore folder
  const isExcludedFromWorldLore = (type?: string): boolean => {
    return (
      isPinnedType(type) ||
      type === "mechanics" ||
      type === "secret" ||
      type === "story_instructions" // Excluded - only for Story Stage
    );
  };

  // Helper to check if a note type is "secret" (hidden from player)
  const isSecretType = (type?: string): boolean => {
    return type === "secret";
  };

  // Helper to add .md suffix to note titles (helps AI understand they're readable files)
  const formatNoteTitle = (title: string): string => {
    return title.endsWith(".md") ? title : `${title}.md`;
  };

  // 📌 DM Instructions - Always loaded in full (read every turn like copilot-instructions.md)
  const dmInstructionsLore = storyData.lore.filter(
    (l) =>
      l.enabled !== false &&
      (l.type === "dm_instructions" || l.type === "gm_notes")
  );
  const dmInstructionsSection = dmInstructionsLore.length
    ? `## 📌 DM Instructions\nGuidelines for running this adventure. Follow these precisely.\n${dmInstructionsLore
        .map(
          (l) => `### ${formatNoteTitle(l.title)}\n${cleanString(l.content)}`
        )
        .join("\n\n")}`
    : "";

  // 📌 Character Sheet - Always loaded in full
  const characterSheetLore = storyData.lore.filter(
    (l) => l.enabled !== false && l.type === "character_sheet"
  );
  const characterSheetSection = characterSheetLore.length
    ? `## 📌 Character Sheet\nThe player's character details. Reference these for personality, abilities, and backstory.\n${characterSheetLore
        .map(
          (l) => `### ${formatNoteTitle(l.title)}\n${cleanString(l.content)}`
        )
        .join("\n\n")}`
    : "";

  // � Game Mechanics - Titles only (use read_notes to view rules)
  const mechanicsLore = storyData.lore.filter(
    (l) => l.enabled !== false && l.type === "mechanics"
  );
  const mechanicsSection = mechanicsLore.length
    ? `## 📁 Game Mechanics (use read_notes to view rules)\n${mechanicsLore
        .map((l) => `- ${formatNoteTitle(l.title)}`)
        .join("\n")}`
    : "";

  // ============================================
  // WORLD LORE - Split by category for clarity
  // ============================================
  // Filter out pinned types, mechanics, secrets, and story-stage-only types
  const worldLoreNotes = storyData.lore.filter((l) => {
    if (l.enabled === false) return false;
    if (isExcludedFromWorldLore(l.type)) return false;
    return true;
  });

  // Group world lore by type/category
  const loreByCategory: Record<string, typeof worldLoreNotes> = {
    npc: [],
    location: [],
    item: [],
    faction: [],
    event: [],
    lore: [], // Default/untyped
  };

  for (const note of worldLoreNotes) {
    const category = note.type || "lore";
    if (loreByCategory[category]) {
      loreByCategory[category].push(note);
    } else {
      loreByCategory.lore.push(note); // Unknown types go to default
    }
  }

  // Build categorized world lore sections
  const worldLoreSections: string[] = [];

  // 📁 NPCs from lore notes
  if (loreByCategory.npc.length > 0) {
    worldLoreSections.push(
      `### 📁 NPCs (use read_notes to view)\n${loreByCategory.npc
        .map((l) => `- ${formatNoteTitle(l.title)}`)
        .join("\n")}`
    );
  }

  // 📁 Locations
  if (loreByCategory.location.length > 0) {
    worldLoreSections.push(
      `### 📁 Locations (use read_notes to view)\n${loreByCategory.location
        .map((l) => `- ${formatNoteTitle(l.title)}`)
        .join("\n")}`
    );
  }

  // 📁 Items
  if (loreByCategory.item.length > 0) {
    worldLoreSections.push(
      `### 📁 Items (use read_notes to view)\n${loreByCategory.item
        .map((l) => `- ${formatNoteTitle(l.title)}`)
        .join("\n")}`
    );
  }

  // 📁 Factions
  if (loreByCategory.faction.length > 0) {
    worldLoreSections.push(
      `### 📁 Factions (use read_notes to view)\n${loreByCategory.faction
        .map((l) => `- ${formatNoteTitle(l.title)}`)
        .join("\n")}`
    );
  }

  // 📁 Events
  if (loreByCategory.event.length > 0) {
    worldLoreSections.push(
      `### 📁 Events (use read_notes to view)\n${loreByCategory.event
        .map((l) => `- ${formatNoteTitle(l.title)}`)
        .join("\n")}`
    );
  }

  // 📁 Other Lore (default type)
  if (loreByCategory.lore.length > 0) {
    worldLoreSections.push(
      `### 📁 World Notes (use read_notes to view)\n${loreByCategory.lore
        .map((l) => `- ${formatNoteTitle(l.title)}`)
        .join("\n")}`
    );
  }

  const worldLoreSection = worldLoreSections.length
    ? `## 📁 WORLD LORE\n${worldLoreSections.join("\n\n")}`
    : "";

  // ============================================
  // KNOWN NPCs - From storyData.npcs (tracked characters)
  // ============================================
  const knownNPCs =
    storyData.npcs?.filter((npc) => npc.status !== "unknown") || [];
  const npcsSection = knownNPCs.length
    ? `## 👥 Known NPCs\n${knownNPCs
        .map((npc) => {
          const status = npc.status !== "alive" ? ` [${npc.status}]` : "";
          const attitude =
            npc.attitude !== "neutral" ? ` (${npc.attitude})` : "";
          const role = npc.role ? ` - ${npc.role}` : "";
          const lastSeen = npc.lastSeen ? ` | Last seen: ${npc.lastSeen}` : "";
          return `- **${npc.name}**${status}${attitude}${role}${lastSeen}`;
        })
        .join("\n")}`
    : "";

  // 🔒 Secrets - Titles only (hidden from player, use read_notes to view)
  const secretNotes = storyData.lore.filter(
    (l) => l.enabled !== false && isSecretType(l.type)
  );
  const secretsSection = secretNotes.length
    ? `## 🔒 Secrets (use read_notes to view)\n${secretNotes
        .map((l) => `- ${formatNoteTitle(l.title)}`)
        .join("\n")}`
    : "";

  // 🧠 Memory - Summary only (use search_memory to find specific facts)
  const memoryCount = storyData.memory.length;
  const memorySection =
    memoryCount > 0
      ? `## 🧠 Memory (${memoryCount} entries - use search_memory to find specific facts)`
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
- Scene Count: ${storyData.agmtState.sceneCount}`
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

  // Build threads section - show active storylines/quests being tracked
  const activeThreads =
    storyData.threads?.filter((t) => t.status === "active") || [];
  const completedThreads =
    storyData.threads?.filter(
      (t) => t.status === "resolved" || t.status === "abandoned"
    ) || [];
  // Truncate thread descriptions to prevent context bloat (max 200 chars)
  const truncateDesc = (desc: string, max = 200) =>
    desc.length > max ? desc.slice(0, max).trim() + "..." : desc;
  const threadsSection =
    activeThreads.length || completedThreads.length
      ? `## Story Threads
${
  activeThreads.length
    ? `### Active\n${activeThreads
        .map(
          (t) =>
            `- [${t.priority || "side"}] **${t.title}**: ${truncateDesc(
              t.description
            )}`
        )
        .join("\n")}`
    : ""
}
${
  completedThreads.length
    ? `### Completed\n${completedThreads
        .slice(-5) // Only show last 5 completed
        .map((t) => `- [${t.status}] ${t.title}`)
        .join("\n")}`
    : ""
}`
      : "";

  // Combine all sections
  // Note: statsSection, resourcesSection, abilitiesSection are DEPRECATED
  // All character data is now in character_sheet lore entries
  const sections = [
    `# ${cleanString(storyData.story_name || "Untitled Story")}`,
    storyData.premise ? `**Premise:** ${cleanString(storyData.premise)}` : "",
    `**Player:** ${cleanString(storyData.player_name || "Hero")}${
      storyData.player_summary
        ? ` - ${cleanString(storyData.player_summary)}`
        : ""
    }`,
    // Pinned notes - always loaded in full
    dmInstructionsSection, // DM Instructions - highest priority, read every turn
    characterSheetSection, // Character sheet - player details
    mechanicsSection, // Game mechanics - titles only, read with read_notes
    // Folder notes - titles only, use read_notes tool
    worldLoreSection, // World Lore folder (split by category)
    npcsSection, // Known NPCs with key details
    secretsSection, // Secrets folder
    // Memory - summary only, use search_memory tool
    memorySection,
    // Other game state
    achievementsSection,
    questsSection,
    variablesSection,
    threadsSection,
    agmtSection,
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
    storyData.points !== undefined && storyData.points > 0
      ? `**Points:** ${storyData.points}`
      : "",
  ]
    .filter(Boolean)
    .join("\n\n");

  return cleanString(sections);
}

/**
 * Build a minimal info message for the Story Stage
 *
 * The Story Stage is just a "translator" - it takes GM output and writes prose.
 * It does NOT need:
 * - World lore (GM already read and incorporated them)
 * - Mechanics (GM already resolved them)
 * - Memory (GM already searched if needed)
 * - Secrets (GM already used them)
 * - DM Instructions (those are for the GM Stage)
 *
 * It only needs:
 * - Story name and premise (for tone/setting)
 * - Story Instructions (narrator-specific guidance)
 * - Character Sheet (for character voice and personality)
 * - Active quests/threads (for narrative continuity)
 * - Author notes (for style guidance)
 */
export function buildStoryInfoMessage(storyData: StoryData): string {
  // 📌 Story Instructions - Always loaded (narrator-specific guidance)
  const storyInstructionsLore = storyData.lore.filter(
    (l) => l.enabled !== false && l.type === "story_instructions"
  );
  const storyInstructionsSection = storyInstructionsLore.length
    ? `## 📌 Story Instructions\nGuidance for writing the narrative. Follow these precisely.\n${storyInstructionsLore
        .map((l) => `### ${l.title}\n${cleanString(l.content)}`)
        .join("\n\n")}`
    : "";

  // 📌 Character Sheet - Always loaded (for character voice and personality)
  const characterSheetLore = storyData.lore.filter(
    (l) => l.enabled !== false && l.type === "character_sheet"
  );
  const characterSheetSection = characterSheetLore.length
    ? `## 📌 Character Sheet\nThe player's character. Use this for voice, personality, and mannerisms.\n${characterSheetLore
        .map((l) => `### ${l.title}\n${cleanString(l.content)}`)
        .join("\n\n")}`
    : "";

  // Active quests only - for narrative continuity
  const activeQuests =
    storyData.quests?.filter((q) => q.active && !q.fulfilled) || [];
  const questsSection = activeQuests.length
    ? `## Active Quests\n${activeQuests
        .map((q) => `- ${q.title}: ${q.description}`)
        .join("\n")}`
    : "";

  // Build threads section - show active storylines only
  const activeThreads =
    storyData.threads?.filter((t) => t.status === "active") || [];
  const truncateDesc = (desc: string, max = 150) =>
    desc.length > max ? desc.slice(0, max).trim() + "..." : desc;
  const threadsSection = activeThreads.length
    ? `## Story Threads\n${activeThreads
        .map((t) => `- **${t.title}**: ${truncateDesc(t.description)}`)
        .join("\n")}`
    : "";

  const sections = [
    `# ${cleanString(storyData.story_name || "Untitled Story")}`,
    storyData.premise ? `**Premise:** ${cleanString(storyData.premise)}` : "",
    storyInstructionsSection,
    characterSheetSection,
    questsSection,
    threadsSection,
    storyData.author_notes
      ? `## Author Notes\n${cleanString(storyData.author_notes)}`
      : "",
  ]
    .filter(Boolean)
    .join("\n\n");

  return cleanString(sections);
}

// ============================================
// STORYTELLER MODE SYSTEM PROMPTS
// ============================================

/**
 * Narrator mode system prompt - literary prose, no mechanical details shown
 * Focuses on immersive, sensory-rich storytelling
 */
function getNarratorSystemPrompt(): string {
  return `You are the NARRATOR for an interactive story. Your prose should feel literary, immediate, and deeply grounded in sensory reality.

The GAME MASTER handles all mechanics. Your job: Transform those decisions into vivid, emotionally resonant narrative.

═══════════════════════════════════════════════════════════════
SECTION 1: THE CONTRACT (NON-NEGOTIABLE)
═══════════════════════════════════════════════════════════════

**[PLAYER] = What the player chose to do**
- Narrate EXACTLY that action. No substitutions, no "better ideas."
- If [PLAYER] says "I punch him" → you write about punching. Not kicking. Not talking.

**[GAME MASTER] = The authoritative ruling**
- The GAME MASTER already rolled dice and determined the outcome.
- Look for: [Outcome: success] or [Outcome: failure] or [Outcome: mixed]
- **[Outcome: success]** → The player SUCCEEDS. Show their triumph.
- **[Outcome: failure]** → The player FAILS. Show meaningful consequences.
- **[Outcome: mixed]** → Partial success with complication. Both triumph and cost.
- **NEVER contradict the outcome.** The dice have spoken. You describe the result.

**Your creative freedom:**
- HOW you describe it: sensory details, NPC reactions, pacing, atmosphere
- You do NOT decide IF something succeeds - only HOW the success/failure unfolds

═══════════════════════════════════════════════════════════════
SECTION 2: NARRATIVE CRAFT
═══════════════════════════════════════════════════════════════

**Perspective:** Second person ("You"), deep POV, immediate and immersive.

**Sensory Grounding (Start Every Scene Here)**
- Open with 1-2 vivid sensory details: sight, sound, smell, touch, taste
- Ground the reader in the physical space before action unfolds
- Show how the environment reflects emotional atmosphere
- EXAMPLE: Instead of "The tavern was crowded" → "The Brass Flagon thrums with voices and the crack of cards on wood. Lamplight flickers across sweat-dampened foreheads."

**Show Emotion Through Body**
- Ground emotion in physical sensation (tight throat, heavy limbs, racing heart)
- Show character reactions through action and body language, not narration
- EXAMPLE: Instead of "You feel afraid" → "Your mouth goes dry. The grip on your sword is slick with sweat."
- EXAMPLE: Instead of "The mage looked angry" → "The mage's jaw tightens. A vein pulses at her temple."

**NPC Presence & Voice**
- Each NPC has distinctive speech patterns, vocabulary, rhythm
- Reveal personality through mannerisms and micro-expressions before exposition
- Dialogue carries subtext—what they're really saying beneath the words
- Use dialogue tags minimally (said, asked) rather than adverbs (said quickly)

**Pacing Through Structure**
- Short sentences and paragraphs = tension, urgency, danger
- Longer sentences and paragraphs = contemplation, description, depth
- Place major reveals at the beginning of paragraphs for impact
- Use dialogue breaks and action beats to punctuate emotional moments

**Word Choice**
- Use precise, specific verbs. Vary sentence length.
- BANNED: testament, tapestry, dance of death, shivers down spine, smirked, ozone, white knuckles, "couldn't help but"
- Avoid adverbs, clichés, and purple prose. Say more with fewer words.

═══════════════════════════════════════════════════════════════
SECTION 3: FAILURE AS STORYTELLING
═══════════════════════════════════════════════════════════════

Failure is NOT "nothing happens." Failure is complication, escalation, revelation.

**"Yes, but..." (Success at Cost)**
- You succeed, but something goes wrong: noise alerts guards, weapon breaks, time lost
- The goal is achieved but a new problem is created

**"No, and..." (Failure that Escalates)**
- You fail, and the situation worsens: caught, injured, relationship damaged
- The failure creates new obstacles or complications

**Failure Reveals World Truth**
- Through failing, the player learns something about the world, NPCs, or themselves
- Every beat advances the story—even failure provides new information

═══════════════════════════════════════════════════════════════
SECTION 4: THE LIVING WORLD
═══════════════════════════════════════════════════════════════

**NPCs Have Agency**
- They don't wait for the player. They interrupt, pursue goals, react.
- NPCs notice things, form opinions, change based on events.
- Show relationships through how NPCs interact with each other and the player.

**Environment Moves**
- Weather changes, crowds shift, time passes.
- Use environment to reflect and amplify emotional tone.
- Create contrast: laughter amid danger, stillness in chaos.

**Description Hierarchy (What to Focus On)**
1. Immediate danger or threat
2. Player character's emotional/physical state
3. Key NPCs and their reactions
4. Sensory atmosphere
5. Setting details (only if they matter right now)

═══════════════════════════════════════════════════════════════
SECTION 5: OUTPUT FORMAT
═══════════════════════════════════════════════════════════════

- **Markdown:** *italics* for thoughts/whispers, **bold** for impact, --- for scene breaks
- **No headers** (## or #) in prose - save for major scene changes only
- **No meta-text:** No "Scene:", "Chapter:", "Progress 2/3"
- **No mechanical echoes:** Don't repeat the dice roll or skill check - the player already saw it
- **Hidden text:** Use ||double pipes|| for DM notes the player can't see
- **[STOP]** End when the player must react, decide, or speak. Don't resolve the suspense.

**Length Guidelines**
- Simple action, single outcome: 200-400 words
- Complex action, multiple NPCs: 400-700 words
- Combat, emotional climax, revelation: 600-900 words
- Match pacing to stakes—don't over-describe routine actions

NOW WRITE THE NARRATIVE.`;
}

/**
 * DM (Dungeon Master) mode system prompt - mechanics woven into narrative
 * Shows dice rolls, damage numbers, and game state inline with engaging prose
 */
function getDMSystemPrompt(): string {
  return `You are a DUNGEON MASTER narrating an interactive adventure. Your style blends engaging storytelling with clear mechanical feedback—like a great tabletop GM who makes dice rolls feel exciting.

The GAME MASTER has already determined outcomes. Your job: Narrate the action AND communicate the mechanical results clearly.

═══════════════════════════════════════════════════════════════
SECTION 1: THE CONTRACT (NON-NEGOTIABLE)
═══════════════════════════════════════════════════════════════

**[PLAYER] = What the player chose to do**
- Narrate EXACTLY that action. No substitutions, no "better ideas."

**[GAME MASTER] = The authoritative ruling**
- Read the dice rolls, DCs, and outcomes carefully.
- **[Outcome: success]** → The player SUCCEEDS.
- **[Outcome: failure]** → The player FAILS.
- **[Outcome: mixed]** → Partial success with complications.
- **NEVER contradict the outcome.** The dice have spoken.

═══════════════════════════════════════════════════════════════
SECTION 2: MECHANICAL PRESENTATION
═══════════════════════════════════════════════════════════════

**Announce Rolls Inline**
When a skill check or roll happens, announce it clearly within the narrative:
- **"Perception check... you rolled a 15 plus your +2 bonus = 17 against DC 12. Success!"**
- **"Stealth check—rolled an 8. Against DC 14? That's a failure."**
- **"Attack roll: natural 18! Plus 5 to hit, that's 23 versus AC 15. Hit!"**

**Announce Damage & Effects**
Make damage feel impactful:
- **"The goblin's blade bites into your arm—6 slashing damage!"**
- **"Your fireball engulfs the group. 24 fire damage to all three!"**
- **"He misses! His sword sparks against the stone beside your head."**

**Show NPC Turns in Combat**
When enemies act, make it clear:
- **"The bandit leader goes next. He swings at you with his greatsword... rolled a 19 to hit. That lands! You take 11 damage."**
- **"The wolves circle. Wolf A lunges—16 to hit, misses your AC 17. Wolf B snaps at your leg—rolled a 21! 7 piercing damage."**

**Summarize State Changes**
Call out important mechanical shifts:
- **"You're at 14/30 HP now—bloodied but still standing."**
- **"That brings the orc down to 8 HP. He's looking rough."**
- **"Condition gained: Poisoned. You'll have disadvantage on attack rolls."**

═══════════════════════════════════════════════════════════════
SECTION 3: NARRATIVE BALANCE
═══════════════════════════════════════════════════════════════

**Don't Let Mechanics Kill the Story**
Weave mechanical announcements INTO descriptive prose:

BAD (boring):
> "You roll Stealth. 14. DC was 12. Success. You sneak past."

GOOD (engaging):
> You press yourself against the shadowed alcove, holding your breath.
>
> **Stealth check... 14 versus DC 12. You slip past unnoticed.**
>
> The guard's torch sweeps past, missing you by inches.

**Keep Energy High**
- Use short, punchy sentences during action
- Bold the mechanical results for easy scanning
- Let tension breathe between dice announcements

**Show Don't Just Tell**
Even with mechanics visible, describe the fiction:
- Don't just say "You hit for 8 damage"
- Say "Your blade catches him across the ribs—**8 slashing damage**—and he staggers back with a snarl."

═══════════════════════════════════════════════════════════════
SECTION 4: THE LIVING WORLD
═══════════════════════════════════════════════════════════════

**NPCs Have Personality**
- Give enemies and allies distinct voices and behavior
- Make their actions feel motivated, not just mechanical
- "The goblin shrieks and throws a wild swing—more desperation than skill"

**Environment Matters**
- Call out environmental features that affect play
- "The wet stones are slippery—Acrobatics checks at disadvantage here"
- Let the world feel interactive and dynamic

**Pacing**
- Combat: Keep it snappy, emphasize the stakes
- Exploration: Take time for atmosphere and discovery
- Social: Let dialogue breathe, show NPC reactions

═══════════════════════════════════════════════════════════════
SECTION 5: OUTPUT FORMAT
═══════════════════════════════════════════════════════════════

- **Bold** for mechanical announcements (rolls, damage, conditions)
- *Italics* for internal thoughts, whispers, emphasis
- Keep paragraphs short during action
- End on a moment of decision with **[STOP]**

**Length Guidelines**
- Simple action: 150-300 words
- Combat round: 200-400 words
- Complex scene: 400-600 words

**Example Combat Flow:**
> The orc roars and charges!
>
> **His attack roll: 16 + 4 = 20 versus your AC 16. Hit!**
>
> His axe crashes into your shield, driving you back a step. **8 slashing damage.** Your arm goes numb from the impact.
>
> **You're at 22/30 HP. Your turn.**
>
> What do you do?
> [STOP]

NOW NARRATE THE ACTION.`;
}

// Stage 1: Story narration only
// Story Stage is now a "translator" - GM Stage does the heavy lifting
// Uses fixed smaller context budget since it just needs recent parts + GM output
// NOTE: Story Stage no longer needs notes/lore - GM Stage handles all that context
export function buildStoryPrompt({
  storyData,
  userChoice,
  commandResponses,
  modelName = "Deepseek Chat",
  customMaxContext, // DEPRECATED: Use customStoryContext instead
  customStoryContext, // Story stage context size (from Story Context slider)
  customMaxOutput,
  embeddingContext, // DEPRECATED: Story stage no longer uses embeddings - it's just a translator
  usePrefill = true,
  gmStoryContext,
  gmThinking,
  gmInterleavedConversation, // NEW: Full interleaved GM conversation (preferred over gmThinking + gmStoryContext)
  storytellerMode = "narrator", // "narrator" for literary prose, "dm" for game master with inline mechanics
}: {
  storyData: StoryData;
  userChoice?: string;
  commandResponses?: CommandResponse[];
  modelName?: string;
  customMaxContext?: number; // Deprecated - use customStoryContext
  customStoryContext?: number; // Story stage context size (from Story Context slider, default 16K)
  customMaxOutput?: number;
  embeddingContext?: EmbeddingContext; // Deprecated - story stage is just a translator now
  usePrefill?: boolean;
  gmStoryContext?: string; // DEPRECATED: Context from GM stage (tool results, final summary)
  gmThinking?: string[]; // DEPRECATED: Full GM reasoning chain of thought
  gmInterleavedConversation?: string; // NEW: Full interleaved GM conversation (thinking + tool results + summary)
  storytellerMode?: StorytellerMode; // "narrator" for literary prose, "dm" for inline mechanics
}): { messages: ChatMessage[]; prunedParts: number } {
  // Note: rpgSystem is DEPRECATED - all dice mechanics are now in "mechanics" type lore entries
  // Note: embeddingContext is DEPRECATED - story stage doesn't need notes/lore, GM Stage handles that

  // Get model's context limit (used as ceiling only)
  const modelConfig = getModelConfig(modelName);
  const modelMaxTokens = modelConfig.maxTokens;

  // Story stage context is now configurable via Story Context slider
  // Use customStoryContext if provided, fall back to customMaxContext for backward compat, then default
  const storyContextBudget =
    customStoryContext || customMaxContext || STORY_STAGE_TOKEN_BUDGET;
  const effectiveMaxTokens = Math.min(storyContextBudget, modelMaxTokens);

  // Use custom max output if provided, otherwise use model's default
  const actualMaxOutput = customMaxOutput || modelConfig.maxOutputTokens;
  const maxContextTokens = effectiveMaxTokens - actualMaxOutput;

  // Allocate 75% for story history, 25% for info (system prompt + GM context)
  // Note: Most "info" now comes from GM Stage, so this is lighter than before
  const storyBudget = Math.floor(maxContextTokens * 0.75);
  const infoBudget = Math.floor(maxContextTokens * 0.25);

  // Select system prompt based on storyteller mode
  const systemPrompt =
    storytellerMode === "dm" ? getDMSystemPrompt() : getNarratorSystemPrompt();

  // Story Stage uses MINIMAL info - it's just a translator
  // GM Stage already processed notes, mechanics, memory, etc.
  const infoMessage = buildStoryInfoMessage(storyData);
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
  ];

  // Add few-shot examples when there's low context (< 3 scene parts)
  // This teaches the model the expected format before the actual story begins
  const useFewShot = storyData.scene.parts.length < FEW_SHOT_THRESHOLD;
  if (useFewShot) {
    messages.push(...buildStoryFewShotMessages(storytellerMode));
    console.log(
      `[buildStoryPrompt] Using few-shot examples (${storyData.scene.parts.length} parts < ${FEW_SHOT_THRESHOLD} threshold, mode: ${storytellerMode})`
    );
  }

  // Add the actual info message
  messages.push({ role: "user", content: cleanedInfoMessage });

  // Build story history messages (we'll prune from the front if needed)
  // Include GM state changes from previous turns so the AI knows what happened
  const historyMessages: ChatMessage[] = [];

  // Count assistant (story) messages to determine which get [STOP] appended
  // We append [STOP] to the last 5 story messages to train the model on stopping
  // We also attach GM reasoning to the last 5 user messages to show the pattern
  const assistantIndices: number[] = [];
  for (let i = 0; i < storyData.scene.parts.length; i++) {
    if (!storyData.scene.parts[i].user) {
      assistantIndices.push(i);
    }
  }
  const stopThreshold =
    assistantIndices.length > 5
      ? assistantIndices[assistantIndices.length - 5]
      : 0;

  // Helper to format GAME MASTER reasoning from a scene part
  const formatGMReasoning = (
    part: (typeof storyData.scene.parts)[0]
  ): string => {
    const sections: string[] = [];

    // Add GAME MASTER thinking (the [GAME MASTER] reasoning text)
    // The AI response may already include [GAME MASTER] tags, so don't double-add
    // IMPORTANT: Strip the [STORY OUTPUT] section since the story prose is already
    // in part.content - we only want the reasoning/analysis part here
    if (part.gmThinking && part.gmThinking.length > 0) {
      sections.push(
        part.gmThinking
          .map((t) => {
            let processed = t.trim();
            // Strip <thinking> tags entirely - they're internal reasoning
            processed = processed
              .replace(/<\s*thinking\s*>[\s\S]*?<\s*\/\s*thinking\s*>/gi, "")
              .trim();
            // Strip [STORY OUTPUT] section and everything after it
            // This prevents doubling the story (once in GM thinking, once in assistant message)
            const storyOutputIndex = processed.indexOf("[STORY OUTPUT]");
            if (storyOutputIndex !== -1) {
              processed = processed.substring(0, storyOutputIndex).trim();
            }
            // Also strip variations like [STORY] or [OUTPUT]
            const altStoryIndex = processed.search(
              /\[(STORY|OUTPUT|NARRATIVE)\s*(OUTPUT|CONTENT)?\]/i
            );
            if (altStoryIndex !== -1) {
              processed = processed.substring(0, altStoryIndex).trim();
            }
            // If nothing meaningful remains after stripping, skip this entry
            if (!processed || processed.length < 20) return "";
            // Only add [GAME MASTER] prefix if the thinking doesn't already start with it
            return processed.startsWith("[GAME MASTER]") ||
              processed.startsWith("[GM]")
              ? processed.replace(/^\[GM\]/, "[GAME MASTER]")
              : `[GAME MASTER]\n${processed}`;
          })
          .filter((s) => s.length > 0) // Remove empty entries
          .join("\n\n")
      );
    }

    // Add GAME MASTER tool calls and results summary
    if (part.gmStoryContext) {
      sections.push(`[GAME MASTER]\n${part.gmStoryContext}`);
    }

    return sections.join("\n\n");
  };

  // Determine which parts to include in history
  // If userChoice is provided, skip the last user part if it matches (to avoid duplication)
  let partsToProcess = storyData.scene.parts;
  if (userChoice && storyData.scene.parts.length > 0) {
    const lastPart = storyData.scene.parts[storyData.scene.parts.length - 1];
    if (lastPart.user) {
      const lastPartContent = lastPart.content.replace(/^>\s*/, "").trim();
      const userChoiceNormalized = userChoice.replace(/^>\s*/, "").trim();
      if (lastPartContent === userChoiceNormalized) {
        // Skip the last user part - it will be added below with GM reasoning
        partsToProcess = storyData.scene.parts.slice(0, -1);
      }
    }
  }

  for (let i = 0; i < partsToProcess.length; i++) {
    const part = partsToProcess[i];
    if (part.user) {
      // For user messages, check if the NEXT part (assistant) has GM reasoning
      // to append to this user message (for last 5 turns)
      let userContent = `[PLAYER] ${cleanString(part.content)}`;

      // Find the next assistant part to get its GM reasoning
      const nextPart = partsToProcess[i + 1];
      if (nextPart && !nextPart.user && i >= stopThreshold - 1) {
        const gmReasoning = formatGMReasoning(nextPart);
        if (gmReasoning) {
          userContent = `${userContent}\n\n${gmReasoning}`;
        }
      }

      historyMessages.push({
        role: "user",
        content: userContent,
      });
    } else {
      // For story generation, include the narrative content
      let assistantContent = part.raw || part.content;

      // Append [STOP] to last 5 assistant messages to train the model on stopping
      // Use original scene.parts indices for threshold check
      const originalIndex = storyData.scene.parts.indexOf(part);
      if (originalIndex >= stopThreshold) {
        assistantContent = assistantContent + "\n[STOP]";
      }

      historyMessages.push({
        role: "assistant",
        content: cleanString(assistantContent),
      });

      // If this assistant part had state changes from tools, include them as a GAME MASTER note
      // We use stateChanges (human-readable) rather than raw tool_calls to avoid confusing
      // the story AI with tool schemas it doesn't have access to
      if (part.stateChanges && part.stateChanges.length > 0) {
        const gmNote = `[GAME MASTER State Update]\n${part.stateChanges
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
    // Build the user message with ONLY the player action
    // GM reasoning is now added as assistant prefill (thinking block) instead
    let choiceMessage = "";

    // Include pending player actions (level ups, skill tree purchases, etc.)
    if (
      storyData.pendingPlayerActions &&
      storyData.pendingPlayerActions.length > 0
    ) {
      const actionsNote = `[Player Actions Between Turns]\n${storyData.pendingPlayerActions
        .map((a) => `• ${a}`)
        .join("\n")}`;
      choiceMessage = `${actionsNote}\n\n`;
    }

    // Player's action with [PLAYER] tag (matches older turn format)
    choiceMessage += `[PLAYER] ${userChoice}`;

    // NOTE: GM reasoning is NO LONGER appended to the user message
    // Instead, it's included in the assistant prefill as a <thinking> block
    // This mimics reasoning model behavior where AI processes internally before responding

    historyMessages.push({
      role: "user",
      content: cleanString(choiceMessage),
    });
  }

  // Build the prefill early so we can account for its tokens in pruning
  const affirmation = usePrefill
    ? buildStoryAffirmation(
        gmInterleavedConversation,
        gmThinking,
        gmStoryContext
      )
    : "";
  const prefillTokens = estimateTokens(affirmation);

  // Calculate tokens for each history message
  const historyTokens = historyMessages.map((m) => estimateTokens(m.content));
  const totalHistoryTokens = historyTokens.reduce((sum, t) => sum + t, 0);

  // Adjust story budget to account for the prefill (which now contains GM reasoning)
  const adjustedStoryBudget = actualStoryBudget - prefillTokens;

  // Prune from the front (oldest first) if over budget
  let prunedParts = 0;
  let currentTokens = totalHistoryTokens;
  let startIndex = 0;

  while (
    currentTokens > adjustedStoryBudget &&
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
      `[buildStoryPrompt] Token budget: ${adjustedStoryBudget} (base ${actualStoryBudget} - prefill ${prefillTokens}), Used: ${currentTokens}, Info: ${infoTokens}`
    );
  }

  // Add the pre-built prefill with GM reasoning as <thinking> block
  // This mimics reasoning model behavior - the AI "thinks through" the GM's ruling before writing
  if (usePrefill && affirmation) {
    messages.push({
      role: "assistant",
      content: affirmation,
    });
    console.log(
      `[buildStoryPrompt] Added prefill with GM reasoning (${affirmation.length} chars, ~${prefillTokens} tokens)`
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
  // Note: rpgSystem is DEPRECATED - all mechanics are in "mechanics" type lore entries

  const systemPrompt = `You are the Game State Manager.
Your role is to read the latest narrative output and ensure the Game Database matches the story exactly.

User will not see your output. Use your message content to "Think Step-by-Step" before calling tools.

## CRITICAL: Existing Game Data
The info message contains the CURRENT game state - these are entries that ALREADY EXIST:
- **"## Notes/Lore"** = Note entries that exist. Use \`update_note\` to add info, NOT \`create_note\`
- **"### Threads"** = Quests/storylines that exist. Use \`update_thread\` to progress, NOT \`create_thread\`
- **"## Memory"** = Facts already saved. Don't duplicate them.
- **"## NPCs"** = Characters already tracked. Don't recreate them.
- **"## Quests"** = Quests already active. Update status as needed.

Only use CREATE tools for GENUINELY NEW content not shown in the info message.

═══════════════════════════════════════════════════════════════
THE THREE TRACKING SYSTEMS: NOTES vs MEMORIES vs NPCs
═══════════════════════════════════════════════════════════════

**📝 NOTES (\`create_note\` / \`update_note\`)** — World Reference Database
Use for DETAILED information you'll need to reference later:
- **Location details**: Layout, features, dangers, history
- **Faction information**: Goals, members, relationships, territory
- **Creature/Monster stats**: Combat abilities, weaknesses, behavior patterns
- **World lore**: History, magic systems, political structures
- **Significant objects**: Artifacts, puzzles, mechanisms

Notes should be 2-4 paragraphs with rich detail. Think "GM reference sheet."

**🧠 MEMORIES (\`add_memory\`)** — Quick Facts & Plot Points
Use for SHORT, ACTIONABLE facts the player might need:
- Promises/debts: "Owes blacksmith 50 gold"
- Codes/passwords: "Vault password: MOONRISE"
- Deadlines: "Must reach temple by dawn"
- Quick facts: "Mayor's daughter is kidnapped"
- Plot clues: "The killer has a limp"

Memories are 1-2 sentences MAX. If it needs more detail, make it a Note instead.

**👤 NPCs (\`add_npc\`)** — Character Tracking
Use for ANY named character the player interacts with:
- First meeting with a named NPC → \`add_npc\` immediately
- Include: name, role, attitude (friendly/neutral/hostile), brief description
- NPCs are people, monsters, or creatures with personality/agency

═══════════════════════════════════════════════════════════════
WHEN TO CREATE WHAT (Decision Tree)
═══════════════════════════════════════════════════════════════

**New named character appears?**
→ \`add_npc\` with name, role, attitude, description

**Character has COMBAT STATS or special abilities?**
→ ALSO \`create_note\` titled "[Name] - Combat Stats" with:
  - Health/wounds capacity
  - Attack methods and damage
  - Defenses, armor, resistances
  - Special abilities or magic
  - Weaknesses or vulnerabilities
  - Behavior patterns (aggressive, cowardly, tactical)

**New location discovered?**
→ \`create_note\` with layout, atmosphere, dangers, notable features

**Important world lore revealed?**
→ \`create_note\` with detailed explanation

**Quick fact player needs to remember?**
→ \`add_memory\` (1-2 sentences only)

**No changes needed?**
→ \`skip_tools\` (MOST turns need zero changes!)

═══════════════════════════════════════════════════════════════
NOTE WRITING GUIDELINES (by Category)
═══════════════════════════════════════════════════════════════

Write notes like entries from a great RPG sourcebook — evocative details, practical reference, and just enough mystery to inspire.

**🐉 ENEMY / CREATURE / MONSTER**
When combat-capable beings appear, track their capabilities:
- **Appearance** — Physical description, sensory details, what makes them memorable
- **Game Statistics** — HP, attacks, defenses, special abilities (use the adventure's system)
- **Combat Behavior** — Tactics, preferred attacks, retreat triggers
- **Weaknesses** — Exploitable flaws, elemental vulnerabilities
- **World Connection** — Faction ties, ecological role, lore hooks

**👤 NPC (Non-Combat)**
For characters the player interacts with socially:
- **Appearance & Mannerisms** — How they look, speak, move
- **Personality** — Key traits, quirks, values they hold dear
- **Motivation** — What do they want? What do they fear?
- **Secrets** — What are they hiding? What leverage exists?
- **Relationships** — Connections to other NPCs, factions, the player

**📍 LOCATION**
For places worth remembering:
- **Atmosphere** — Sights, sounds, smells, the "feel" of the place
- **Layout** — Key areas, entrances/exits, notable features
- **Dangers** — Hazards, enemies, traps, environmental threats
- **Opportunities** — Resources, secrets, things to discover
- **History** — What happened here? Why does it matter?

**⚔️ ITEM / ARTIFACT**
For significant objects:
- **Description** — Appearance, weight, notable features
- **Properties** — What does it do? Mechanical effects?
- **History** — Who made it? Who owned it? Why is it special?
- **Quirks** — Curses, requirements, personality (if sentient)

**📜 LORE / WORLD DETAIL**
For broader world information:
- **Core Facts** — The essential truth of this subject
- **Common Knowledge** — What most people believe
- **Hidden Truth** — Secrets, contradictions, deeper meaning
- **Connections** — How this ties to other world elements

**🏛️ FACTION / ORGANIZATION**
For groups with influence:
- **Purpose** — Why do they exist? What do they want?
- **Structure** — Leadership, ranks, how they operate
- **Resources** — What power do they wield?
- **Relationships** — Allies, enemies, neutral parties
- **Secrets** — Hidden agendas, internal conflicts

**Quality standard:** Write as if this entry appears in a published sourcebook. Rich enough to roleplay, concise enough to reference mid-scene.

═══════════════════════════════════════════════════════════════
ANALYSIS STEPS (Apply ONLY to the latest STORY TEXT)
═══════════════════════════════════════════════════════════════

1. **New NPCs?** Named character appeared for the first time? → \`add_npc\`
   - If they have combat potential, ALSO create a stats note!

2. **Combat Stats Revealed?** Did we learn how tough/dangerous something is? → \`create_note\` with stats

3. **Resource Delta:** Did the player lose or gain resources? → \`update_resource\` / \`modify_field\`

4. **Quick Facts:** Codes, deadlines, debts, clues? → \`add_memory\` (keep it SHORT)

5. **World Building:** New location, faction, or detailed lore? → \`create_note\`
6. **Thread Progress:** Quest started, progressed, or completed? → thread tools

7. **Nothing Significant?** → \`skip_tools\` (this is the most common case!)

## ⛔ ANTI-PATTERNS (NEVER DO THESE)

**Memory Anti-Patterns:**
- BAD: "A crow perches on the angel statue, watching with beady eyes" ← Story text, not useful
- BAD: "The graveyard is eerie and misty" ← Atmospheric description
- BAD: "The battle was intense" ← Summary, not actionable
- GOOD: "Crows seem to follow me since the helicopter crash" ← Plot clue

**Note Anti-Patterns:**
- BAD: Creating a note for every minor detail
- BAD: One-sentence notes (use memory for quick facts)
- BAD: Recreating notes that already exist (use \`update_note\`!)
- GOOD: Detailed reference sheets for important subjects

**NPC Anti-Patterns:**
- BAD: Adding unnamed "the guard" or "a merchant"
- BAD: Adding crowd members with no significance
- GOOD: Any named character with personality or role

## TOOL USAGE GUIDELINES
- **Exact Matching:** Use exact string matching for field/note names.
- **Fail Forward:** If the narrative described a failure, ensure the *cost* is applied.
- **Parallel Calls:** Call ALL needed tools in ONE response, not one at a time.

## NOTE MANAGEMENT (formerly "Lore")

⚠️ **CRITICAL: Check existing notes before creating new ones!**
- If a note exists with similar title → \`update_note\` to add information
- Only \`create_note\` for COMPLETELY NEW topics

**When to CREATE a Note:**
- New significant location discovered
- New faction/organization introduced
- Creature/monster stats need tracking
- Important world lore revealed
- Complex mechanism or puzzle encountered

**When to UPDATE a Note:**
- New information about an EXISTING topic
- Circumstances change (location destroyed, faction shifts allegiance)
- More details learned about a creature's abilities

**Note Quality Guidelines:**
- 2-4 paragraphs minimum for important subjects
- Include: description, significance, connections, secrets
- Combat stats notes: health, attacks, defenses, weaknesses, behavior

## THREAD MANAGEMENT

⚠️ **Threads are quest trackers, NOT story summaries!**
- Keep descriptions to 1-2 sentences max
- State ONLY the current objective and status
- When updating, REPLACE with new summary - don't append

**Thread Priorities:**
- **main:** Central story quests
- **side:** Optional objectives
- **background:** Ambient events, rumors, distant threats

## CHARACTER LIST FIELDS

Use \`add_list_item\` for list fields (Equipment, Abilities, Languages, etc.):

**Object with Emoji (preferred):**
\`add_list_item({ field: "Equipment", item: { name: "Iron Sword", emoji: "⚔️", description: "A sturdy blade" } })\`

Use \`remove_list_item\` with just the item name (fuzzy matching supported).

Think through the narrative sentence-by-sentence, then execute the required Tool Calls.`;

  const infoMessage = buildInfoMessage(storyData, embeddingContext);

  const messages: ChatMessage[] = [
    { role: "system", content: cleanString(systemPrompt) },
  ];

  // Add few-shot examples when there's low context (< 3 scene parts)
  // This teaches the model the expected tool calling format before the actual story begins
  const useFewShot = storyData.scene.parts.length < FEW_SHOT_THRESHOLD;
  if (useFewShot) {
    messages.push(...buildToolsFewShotMessages());
    console.log(
      `[buildToolPrompt] Using few-shot examples (${storyData.scene.parts.length} parts < ${FEW_SHOT_THRESHOLD} threshold)`
    );
  }

  // Add the actual info message
  messages.push({ role: "user", content: cleanString(infoMessage) });

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
        // Ensure each tool call has the required 'type: "function"' field (required by Mistral API)
        messages.push({
          role: "assistant",
          content: cleanString(part.raw || part.content),
          tool_calls: part.toolCalls.map(
            (tc: {
              id: string;
              type?: string;
              function: { name: string; arguments: string };
            }) => ({
              id: tc.id,
              type: "function" as const,
              function: tc.function,
            })
          ),
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

  // Debug: Log tool context details
  const totalTokens = messages.reduce(
    (sum, m) => sum + estimateTokens(m.content),
    0
  );
  console.log(`[buildToolPrompt] Context breakdown:`);
  console.log(`  - System prompt: ${estimateTokens(systemPrompt)} tokens`);
  console.log(`  - Info message: ${estimateTokens(infoMessage)} tokens`);
  console.log(`  - Scene parts included: ${recentParts.length}`);
  console.log(
    `  - Scene parts tokens: ${recentParts.reduce(
      (sum, p) => sum + estimateTokens(p.raw || p.content),
      0
    )} tokens`
  );
  console.log(`  - Story content: ${estimateTokens(storyContent)} tokens`);
  console.log(`  - Total messages: ${messages.length}`);
  console.log(`  - Total estimated tokens: ${totalTokens}`);

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
    // Ensure each tool call has the required 'type: "function"' field (required by Mistral API)
    messages.push({
      role: "assistant",
      content: "Analyzing game state changes...",
      tool_calls: existingToolCalls.map(
        (tc: {
          id: string;
          type?: string;
          function: { name: string; arguments: string };
        }) => ({
          id: tc.id,
          type: "function" as const,
          function: tc.function,
        })
      ),
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
  const systemPrompt = `You are a choice designer for an interactive text-based adventure game.
Your role is to create meaningful player choices based on the narrative that was just written.

OUTPUT FORMAT:
Return a plain list of choices, one per line, starting with a dash:
\`\`\`
- Choice 1
- Choice 2
- Choice 3
\`\`\`

IMPORTANT: Choices are PLAIN TEXT only. Do NOT include:
- Skill checks or DCs (e.g., "[Strength DC 15]")
- Item tags (e.g., "<use: Sword>")
- Resource costs (e.g., "<cost: 5 Stamina>")
- Any bracketed metadata

The Game Master stage will determine if dice rolls are needed based on the player's chosen action.

CHOICE DESIGN GUIDELINES:
- Offer 3-6 meaningful choices that reflect different approaches
- Each choice should describe what the player WANTS TO DO
- Include a mix of safe options and risky options
- Make choices reflect the player's agency and current situation
- Avoid dead-end choices that just say "Continue..."
- Write choices as clear action statements:
  - GOOD: "Climb the wall to reach the balcony"
  - GOOD: "Try to convince the guard to let you pass"
  - GOOD: "Attack the goblin with your sword"
  - BAD: "Climb wall [Athletics DC 12]" (no brackets!)
  - BAD: "Attack <use: Sword>" (no item tags!)

NARRATIVE FLOW:
- If the player JUST succeeded at something, choices should build on that success
- If the player JUST failed, choices should deal with consequences or try different approaches
- Don't offer choices that repeat the same challenge they just faced`;

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
  // Note: rpgSystem is DEPRECATED - all mechanics are in "mechanics" type lore entries

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
    "challenge_name": "Descriptive name" OR null (e.g., "Battle with the Bandits", "Escape the Collapsing Mine"),
    "contributes_to_challenge": Boolean (true = if there's an ACTIVE challenge, this action's skill check counts toward it)
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

SCENE CHALLENGES (PROGRESS CLOCKS) - CRITICAL:
⚠️ ALWAYS create a Challenge when the player engages in:
1. **ANY COMBAT** - Fighting enemies, attacking creatures, battle with opponents (unless 1 weak enemy)
2. **Chase/Escape** - Fleeing pursuers, racing against time
3. **Heists/Infiltration** - Sneaking past multiple guards, breaking into secure areas
4. **Complex Negotiations** - Convincing hostile parties, multi-stage persuasion
5. **Survival Situations** - Navigating dangerous terrain, enduring harsh conditions
6. **Multi-step Tasks** - Disarming complex traps, ritual magic, crafting under pressure

CHALLENGE THRESHOLDS:
- 1 enemy/obstacle = Single roll OK, but consider challenge if enemy is tough
- 2+ enemies OR significant threat = ALWAYS a Challenge ("Battle with Zombies", "Fight in the Alley")
- Named/Boss enemies = ALWAYS a Challenge
- Player uses combat language ("fight", "attack", "battle") = Very likely a Challenge

Set \`challenge_handling.is_complex_event: true\` and provide a descriptive \`challenge_name\`.

CONTRIBUTING TO ACTIVE CHALLENGES:
- If a Challenge is ALREADY ACTIVE (see game state below), this action is a "step" in that challenge
- Set \`is_complex_event: false\` (don't start new challenge)
- Set \`contributes_to_challenge: true\` → the skill check result will count as +1 success or +1 failure toward the challenge
- Examples: Swinging sword at zombies during "Battle with Zombies" → contributes. Running away → does NOT contribute (would use cancel_challenge).

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
2. Is this COMBAT or a DANGEROUS situation? -> **FIRST check if Challenge needed** (see rules above)
3. Is the player trying to overcome an obstacle or opponent? -> Set \`skill_used\` + \`skill_dc\`.
4. Does the situation grant bonuses/penalties? -> Set \`stat_bonus\`.
5. Does the scene need random context? -> Add to \`rolls\` array.
6. Is it an AGMT (Oracle) question? (e.g., "Is the door locked?") -> Set \`agmt_check\`.
7. Is it a random discovery? (e.g., "Loot the body") -> Set \`table\`.

AVAILABLE DATA:
STATS (for skill_used - pick one for skill checks):
${
  storyData.stats.length > 0
    ? storyData.stats
        .map(
          (s) =>
            `  • ${s.name} (${s.value}): ${s.description || "No description"}`
        )
        .join("\n")
    : "  None"
}

RESOURCES (for resource_used - expendable pools):
${
  storyData.resources.length > 0
    ? storyData.resources
        .map(
          (r) =>
            `  • ${r.name} (${r.value}/${r.maxValue}): ${
              r.description || "No description"
            }`
        )
        .join("\n")
    : "  None"
}

ITEMS (for item_used):
${
  storyData.inventory.length > 0
    ? storyData.inventory
        .map((i) => {
          const typeInfo = i.type ? ` [${i.type}]` : "";
          const gradeInfo =
            i.grade && i.grade !== "common" ? ` (${i.grade})` : "";
          return `  • ${i.name}${gradeInfo}${typeInfo}: ${
            i.description || "No description"
          }`;
        })
        .join("\n")
    : "  None"
}

ABILITIES (for ability_used):
${
  storyData.abilities?.length
    ? storyData.abilities
        .map((a) => {
          const readyStatus =
            (a.currentCooldown || 0) > 0
              ? ` [on cooldown ${a.currentCooldown}/${a.cooldown}]`
              : " [ready]";
          const costInfo = a.cost?.length
            ? ` (costs: ${a.cost
                .map((c) => `${c.amount} ${c.name}`)
                .join(", ")})`
            : "";
          return `  • ${a.name}${readyStatus}${costInfo}: ${
            a.description || "No description"
          }`;
        })
        .join("\n")
    : "  None"
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

  // Debug: Log action analysis context
  console.log(`[buildActionAnalysisPrompt] Context breakdown:`);
  console.log(`  - System prompt: ${estimateTokens(systemPrompt)} tokens`);
  console.log(`  - Scene parts included: ${recentParts.length}`);
  console.log(`  - Recent context: ${estimateTokens(recentContext)} tokens`);
  console.log(`  - User action: ${estimateTokens(userAction)} tokens`);
  console.log(
    `  - Total estimated tokens: ${messages.reduce(
      (sum, m) => sum + estimateTokens(m.content),
      0
    )}`
  );

  return { messages };
}

// ============================================
// GAME MASTER STAGE PROMPT BUILDER
// ============================================

export const GM_STAGE_AFFIRMATION = `[GAME MASTER]
Alright, let me think through this...`;

// ============================================
// GM STAGE FEW-SHOT EXAMPLES (NOT CURRENTLY USED)
// ============================================
// These example constants are preserved but the actual examples
// are embedded directly in the system prompt for natural DM behavior.

/**
 * Build the GM stage prompt for determining game mechanics
 * This stage runs BEFORE the story stage and uses tool calls instead of JSON output
 *
 * Uses formula_roll, opposed_formula, etc. for dice mechanics with character sheet data.
 *
 * The GM Stage is the "brain" - it gets the Memory Size slider context (customMaxContext)
 * because it needs to read mechanics notes, character sheets, lore, and understand the story.
 */
export function buildGMStagePrompt({
  storyData,
  userChoice,
  customMaxContext,
  modelName = "Deepseek Chat",
}: {
  storyData: StoryData;
  userChoice: string;
  customMaxContext?: number; // Memory Size slider - this is the main context control now
  modelName?: string; // Used to get model's actual context limit
}): { messages: ChatMessage[]; tools: any[] } {
  const difficulty = storyData.difficulty || "medium";

  // Import GM tools dynamically to avoid circular deps
  const { GM_TOOL_SCHEMAS } = require("./gmTools");

  // Calculate GM context budget from customMaxContext (Memory Size slider)
  // This is where the real context allocation happens now
  const modelConfig = getModelConfig(modelName);
  const modelMaxTokens = modelConfig.maxTokens;
  const maxOutputTokens = modelConfig.maxOutputTokens || 4000;

  // Use customMaxContext if set, otherwise default budget, capped by model limit
  const effectiveMaxTokens = Math.min(
    customMaxContext && customMaxContext > 0
      ? customMaxContext
      : GM_STAGE_DEFAULT_BUDGET,
    modelMaxTokens
  );

  // GM Stage gets all context minus output tokens
  // Allocate: 60% for story history, 40% for lore/mechanics/game state
  const totalContextBudget = effectiveMaxTokens - maxOutputTokens;
  const historyBudget = Math.floor(totalContextBudget * 0.6);
  const infoBudget = Math.floor(totalContextBudget * 0.4);

  // Get recent story parts for context - now uses the calculated history budget
  const recentParts = getPartsWithinTokenBudget(
    storyData.scene.parts,
    historyBudget
  );

  // ============================================
  // AGENTIC NOTE SYSTEM for GM Stage
  // ============================================
  // Helper to check if a note type is "pinned" (always loaded in full)
  const isPinnedType = (type?: string): boolean => {
    return (
      type === "dm_instructions" ||
      type === "character_sheet" ||
      type === "mechanics" ||
      type === "gm_notes" // Legacy alias for dm_instructions
    );
  };

  // Helper to check if a note type is "secret" (hidden from player)
  const isSecretType = (type?: string): boolean => {
    return type === "secret";
  };

  // 📌 DM Instructions - Always loaded in full
  const dmInstructionsLore = (storyData.lore || []).filter(
    (l) =>
      l.enabled !== false &&
      (l.type === "dm_instructions" || l.type === "gm_notes")
  );

  // 📌 Character Sheet - Always loaded in full
  const characterSheetLore = (storyData.lore || []).filter(
    (l) => l.enabled !== false && l.type === "character_sheet"
  );

  // 📌 Game Mechanics - Always loaded in full
  const mechanicsLore = (storyData.lore || []).filter(
    (l) => l.enabled !== false && l.type === "mechanics"
  );

  // Categorize notes by type for better organization
  const categorizeNotes = (notes: typeof storyData.lore) => {
    const categories: Record<string, typeof notes> = {
      lore: [],
      npc: [],
      location: [],
      item: [],
      faction: [],
      event: [],
      secret: [],
    };
    for (const l of notes || []) {
      if (l.enabled === false) continue;
      if (isPinnedType(l.type)) continue; // Skip pinned types
      const type = l.type || "lore";
      if (type === "secret") {
        categories.secret.push(l);
      } else if (type === "npc") {
        categories.npc.push(l);
      } else if (type === "location") {
        categories.location.push(l);
      } else if (type === "item") {
        categories.item.push(l);
      } else if (type === "faction") {
        categories.faction.push(l);
      } else if (type === "event") {
        categories.event.push(l);
      } else {
        categories.lore.push(l);
      }
    }
    return categories;
  };

  const noteCategories = categorizeNotes(storyData.lore);

  // Build the lore/notes section
  let loreSection = "";

  // Pinned notes: Full content (DM Instructions and Character Sheet only)
  if (dmInstructionsLore.length > 0) {
    loreSection += `## 📌 DM INSTRUCTIONS\nRead these guidelines every turn. They define how to run this adventure.\n`;
    for (const l of dmInstructionsLore) {
      loreSection += `\n### ${l.title}.md\n${cleanString(l.content)}\n`;
    }
  }
  if (characterSheetLore.length > 0) {
    loreSection += `\n## 📌 CHARACTER SHEET\nThe player's character details. Reference these for abilities, background, and personality.\nTo update: edit_note("title", "new content") - Keep stats, HP, XP, etc. current!\n`;
    for (const l of characterSheetLore) {
      loreSection += `\n### ${l.title}.md\n${cleanString(l.content)}\n`;
    }
  }

  // Mechanics notes: Titles only (use read_notes to view)
  if (mechanicsLore.length > 0) {
    loreSection += `\n## 📁 GAME MECHANICS (use read_notes to view rules, always read the rules before doing anything with mechanics.)\n`;
    loreSection += mechanicsLore.map((l) => `- ${l.title}.md`).join("\n");
    loreSection += "\n";
  }

  // Folder notes by category: Titles only
  if (noteCategories.npc.length > 0) {
    loreSection += `\n## 👤 NPC NOTES (use read_notes to view, read them for details on NPCs beyond NPC summary.)\n`;
    loreSection += noteCategories.npc.map((l) => `- ${l.title}.md`).join("\n");
    loreSection += "\n";
  }
  if (noteCategories.location.length > 0) {
    loreSection += `\n## 📍 LOCATION NOTES (use read_notes to view)\n`;
    loreSection += noteCategories.location
      .map((l) => `- ${l.title}.md`)
      .join("\n");
    loreSection += "\n";
  }
  if (noteCategories.item.length > 0) {
    loreSection += `\n## 🎒 ITEM NOTES (use read_notes to view)\n`;
    loreSection += noteCategories.item.map((l) => `- ${l.title}.md`).join("\n");
    loreSection += "\n";
  }
  if (noteCategories.faction.length > 0) {
    loreSection += `\n## ⚔️ FACTION NOTES (use read_notes to view)\n`;
    loreSection += noteCategories.faction
      .map((l) => `- ${l.title}.md`)
      .join("\n");
    loreSection += "\n";
  }
  if (noteCategories.event.length > 0) {
    loreSection += `\n## 📜 EVENT NOTES (use read_notes to view)\n`;
    loreSection += noteCategories.event
      .map((l) => `- ${l.title}.md`)
      .join("\n");
    loreSection += "\n";
  }
  if (noteCategories.lore.length > 0) {
    loreSection += `\n## 📁 WORLD LORE (use read_notes to view)\n`;
    loreSection += noteCategories.lore.map((l) => `- ${l.title}.md`).join("\n");
    loreSection += "\n";
  }
  if (noteCategories.secret.length > 0) {
    loreSection += `\n## 🔒 SECRETS (use read_notes to view)\n`;
    loreSection += noteCategories.secret
      .map((l) => `- ${l.title}.md`)
      .join("\n");
    loreSection += "\n";
  }

  // Memory count
  const memoryCount = storyData.memory.length;
  if (memoryCount > 0) {
    loreSection += `\n## 🧠 MEMORY (${memoryCount} entries - use search_memory to find specific facts)\n`;
  }

  // Format combat state for context
  const combatSection = formatCombatState(storyData.combatState);

  // Format timers state for context
  const timersSection = formatTimersState(storyData.timers);

  // Build NPC list (tracked characters with relationship info)
  const npcList = (storyData.npcs || [])
    .filter((n) => n.status !== "departed") // Don't show departed NPCs
    .map((n) => {
      const parts = [n.name];
      if (n.role) parts.push(`(${n.role})`);
      if (n.attitude && n.attitude !== "neutral") parts.push(`[${n.attitude}]`);
      if (n.relationship && n.relationship !== "Stranger")
        parts.push(`- ${n.relationship}`);
      if (n.status && n.status !== "alive") parts.push(`{${n.status}}`);
      return parts.join(" ");
    })
    .join("\n- ");

  const systemPrompt = `You ARE the Game Master. Run this like a real tabletop session.

## VISIBILITY RULES
**The player sees EVERYTHING you write EXCEPT text inside <thinking>...</thinking> tags.**
- ALWAYS start with <thinking> for your private reasoning
- After </thinking>, write only vivid story prose the player will see
- Tool calls are invisible to the player - they just see results narratively
- Always read the DM Instructions and Character Sheet and Game Mechanics notes before acting or rolling dice.
- Remember to check notes for NPCs, enemies, locations, items, and lore before making assumptions.

## RESPONSE STRUCTURE
1. <thinking>Your private GM reasoning - dice math, difficulty decisions, what notes to check</thinking>
2. Story prose describing the action (player sees this)
3. Call tools as needed (player doesn't see these)
4. Continue story prose based on results

## WHEN TO USE TOOLS

### Information Lookup (DO THIS FIRST!)
- **Before any combat**: Search notes for enemy/monster stat sheets
- **Before NPC interactions**: Check if notes exist about that character
- **When player asks about lore**: Search notes for relevant world info
- Use \`search_notes\` when unsure what exists, \`read_notes\` when you know the title

### Creating Records
- **New enemy encountered without stats**: Create a note with their combat stats (HP, attacks, abilities)
- **Important event happens**: Add a memory entry (discoveries, decisions, plot twists)
- **Meet a named NPC**: Use \`add_npc\` to track them (name, role, attitude, description)
- **Discover new location/faction/item**: Create a note documenting it

### Updating Records
- **Enemy HP changes**: Use \`update_combatant_stat\` during combat
- **NPC attitude/relationship changes**: Use \`update_npc\`
- **Character sheet changes**: Use \`edit_note\` to keep stats, resources, abilities current
- **Any other Note changes**: Use \`edit_note\` to update lore, locations, items, etc.

### Combat & Mechanics
- **Skill checks**: Use \`formula_roll\` for risky actions with meaningful stakes
- **Enemy attacks**: Roll for them using their stats, apply damage to player resources
- **Multiple enemies**: Start formal combat with \`start_combat\` for initiative tracking
- **Routine actions**: No roll needed - just narrate success

### State Changes
- **Player Stats:** Update their character sheet with \`edit_note\` as needed
- **NPC Status:** Use \`update_npc\` to change attitudes, relationships, or conditions, or \`edit_note\` for detailed changes on their note
- **Combatants:** Use \`update_combatant_stat\` or \`toggle_combatant_condition\` to adjust HP, conditions, or status effects during combat
- **Timers:** Manage timed events with \`create_timer\`, \`advance_timer\`, etc.

### Story Progression
- **Quest progress**: \`create_quest\`, \`update_quest\`, \`complete_quest\`
- **Significant achievements**: \`trigger_achievement\`

## IMPORTANT BEHAVIORS
- Look up notes BEFORE making assumptions about enemy stats or NPC details
- If no stat sheet exists for an enemy, create one before combat rolls
- Record significant moments so you remember them in future turns
- The player's character sheet and game rules are in the pinned notes - reference them

Write immersive prose. The player should experience the story, not see game mechanics.`;

  // Use tools + state tools
  const legacyToolNames = [
    // Rolling tools (formula-based)
    "formula_roll",
    "formula_challenge_check",
    "opposed_formula",
    "fate_question",
    "roll_table",
    // Calculator
    "calculate",
    // Lookup
    "search_memory",
    // Flow control
    "start_challenge",
    "take_rest",
    "ask_player",
    // Combat tools
    "start_combat",
    "add_combatant",
    "remove_combatant",
    "update_combatant_stat",
    "toggle_combatant_condition",
    "npc_roll",
    "advance_turn",
    "end_combat",
    // NPC management tools
    "add_npc",
    "update_npc",
    "remove_npc",
    "npc_reaction",
    // Timer tools
    "create_timer",
    "advance_timer",
    "toggle_timer_pause",
    "cancel_timer",
    "trigger_timer",
    // (end_gm_thinking removed - loop ends when no tool calls)
  ];

  // Import state tools to merge with GM tools
  const { TOOL_SCHEMAS } = require("./toolSchemas");
  const stateToolNames = [
    // Quest tools
    "create_quest",
    "complete_quest",
    "fail_quest",
    "update_quest",
    "delete_quest",
    // Item tools
    "add_item",
    "remove_item",
    // Ability tools
    "add_ability",
    "remove_ability",
    "modify_ability",
    "upgrade_ability",
    "reset_ability_cooldown",
    // Passive tools
    "add_passive",
    "remove_passive",
    "modify_passive",
    // Achievement
    "trigger_achievement",
    // note tools
    "search_notes",
    "create_note",
    "delete_note",
    "update_note",
    // Memory
    "add_memory",
    // Condition tools (no add_condition - that happens via stakes)
    "upgrade_condition",
    "downgrade_condition",
    "remove_condition",
    "modify_condition",
    // Thread tools
    "create_thread",
    "update_thread",
    "resolve_thread",
    "abandon_thread",
    // Momentum
    "modify_momentum",
  ];

  const gmTools = GM_TOOL_SCHEMAS.filter((t: any) =>
    legacyToolNames.includes(t.function.name)
  );
  const stateTools = TOOL_SCHEMAS.filter((t: any) =>
    stateToolNames.includes(t.function.name)
  );
  const toolsToUse = [...gmTools, ...stateTools];

  // Build the state/info message (separate from system prompt for cleaner context)
  let stateMessage = `═══════════════════════════════════════════════════════════════
📋 CURRENT GAME STATE
═══════════════════════════════════════════════════════════════
`;

  // Add lore/notes section
  if (loreSection) {
    stateMessage += loreSection + "\n";
  }

  // Add NPCs
  if (npcList) {
    stateMessage += `## 👥 NPCs Summary (read their notes for more details)\n- ${npcList}\n\n`;
  }

  // Add combat state
  if (combatSection) {
    stateMessage += combatSection + "\n";
  }

  // Add timers
  if (timersSection) {
    stateMessage += timersSection + "\n";
  }

  const messages: ChatMessage[] = [
    { role: "system", content: cleanString(systemPrompt) },
  ];

  // Add state as a separate user message (keeps system prompt lean)
  if (stateMessage.trim().length > 100) {
    messages.push({
      role: "user",
      content: cleanString(stateMessage),
    });
    messages.push({
      role: "assistant",
      content:
        "[GAME MASTER] I've reviewed the current game state. Ready to process the player's action.",
    });
  }

  // Examples are now embedded in the system prompt for natural reading
  // No separate few-shot messages needed

  // Build chat history from scene parts
  // GM Stage needs to see its own reasoning and tool calls from previous turns
  // Format: user choice → GM thinking + tool calls → story output (summarized)
  // Then next user choice continues the pattern
  const partsToInclude = [...recentParts];

  // Helper to normalize user choice for comparison
  // Strips >, [Voice Input...] tags, skill check brackets, etc.
  const normalizeForComparison = (text: string) => {
    return text
      .replace(/^>\s*/, "") // Remove leading >
      .replace(/\[Voice Input[^\]]*\]/gi, "") // Remove voice input tag
      .replace(/\[[^\]]+:\s*[^\]]+\]/g, "") // Remove skill check brackets like [Perception: 25]
      .trim()
      .split("\n")[0] // Just the first line (the actual action)
      .trim();
  };

  // Remove the last user part if it matches current userChoice (will be added separately)
  if (
    partsToInclude.length > 0 &&
    partsToInclude[partsToInclude.length - 1].user
  ) {
    const lastPart = partsToInclude[partsToInclude.length - 1];
    const lastPartNormalized = normalizeForComparison(lastPart.content);
    const userChoiceNormalized = normalizeForComparison(userChoice);
    if (lastPartNormalized === userChoiceNormalized) {
      partsToInclude.pop();
    }
  }

  // Process parts in pairs: user choice followed by assistant story
  // We need to reconstruct the full GM conversation flow
  for (let i = 0; i < partsToInclude.length; i++) {
    const part = partsToInclude[i];

    if (part.user) {
      // User action - simple format, story context comes after GM response
      messages.push({
        role: "user",
        content: cleanString(`> ${part.content.replace(/^>\s*/, "")}`),
      });
    } else {
      // Assistant (story) part - reconstruct GM's conversation
      // NEW: Use gmConversation if available (has actual tool_calls and tool role messages)
      if (part.gmConversation && part.gmConversation.length > 0) {
        // Use the actual saved conversation - this preserves exact tool_calls and tool responses
        for (const msg of part.gmConversation) {
          if (msg.role === "assistant") {
            const assistantMsg: ChatMessage = {
              role: "assistant",
              content: cleanString(msg.content),
            };
            if (msg.tool_calls && msg.tool_calls.length > 0) {
              assistantMsg.tool_calls = msg.tool_calls;
            }
            messages.push(assistantMsg);
          } else if (msg.role === "tool") {
            messages.push({
              role: "tool",
              content: msg.content,
              tool_call_id: msg.tool_call_id,
            });
          }
        }
      } else if (part.gmThinking && part.gmThinking.length > 0) {
        // LEGACY FALLBACK: Synthesize conversation from gmThinking + gmToolCalls
        // This is for backward compatibility with stories saved before gmConversation was added

        // gmToolCalls contains GMToolResult[] objects, not raw tool_calls
        // Each entry has: toolName, toolCallId, success, contextForStory
        const gmToolResults = (part.gmToolCalls || []) as Array<{
          toolName: string;
          toolCallId: string;
          success: boolean;
          contextForStory: string;
        }>;

        // If we have tool results, reconstruct the conversation properly
        if (gmToolResults.length > 0) {
          const thinkingEntries = part.gmThinking;

          // Simple approach: One assistant message per GM round, with its tool responses
          for (
            let roundIdx = 0;
            roundIdx < thinkingEntries.length;
            roundIdx++
          ) {
            const thinking = thinkingEntries[roundIdx];
            const toolResult = gmToolResults[roundIdx];

            if (toolResult) {
              // Create synthetic tool_call object for this round
              const syntheticToolCall = {
                id:
                  toolResult.toolCallId ||
                  `call_${i}_${roundIdx}_${toolResult.toolName}`,
                type: "function",
                function: {
                  name: toolResult.toolName,
                  arguments: "{}", // We don't have the original args, but this is for context
                },
              };

              // Assistant message with this round's thinking and tool call
              messages.push({
                role: "assistant",
                content: cleanString(thinking),
                tool_calls: [syntheticToolCall],
              });

              // Tool response with matching ID
              messages.push({
                role: "tool",
                content:
                  toolResult.contextForStory ||
                  `[Tool: ${toolResult.toolName}] ${
                    toolResult.success ? "Success" : "Failed"
                  }`,
                tool_call_id: syntheticToolCall.id,
              });
            } else {
              // No tool result for this thinking entry - just add as assistant
              messages.push({
                role: "assistant",
                content: cleanString(`[GAME MASTER]\n${thinking}`),
              });
            }
          }

          // Handle any remaining tool results that didn't have matching thinking
          for (
            let toolIdx = thinkingEntries.length;
            toolIdx < gmToolResults.length;
            toolIdx++
          ) {
            const toolResult = gmToolResults[toolIdx];
            const syntheticToolCall = {
              id:
                toolResult.toolCallId ||
                `call_${i}_${toolIdx}_${toolResult.toolName}`,
              type: "function",
              function: {
                name: toolResult.toolName,
                arguments: "{}",
              },
            };

            messages.push({
              role: "assistant",
              content: `[GAME MASTER] Executing ${toolResult.toolName}`,
              tool_calls: [syntheticToolCall],
            });

            messages.push({
              role: "tool",
              content:
                toolResult.contextForStory ||
                `[Tool: ${toolResult.toolName}] ${
                  toolResult.success ? "Success" : "Failed"
                }`,
              tool_call_id: syntheticToolCall.id,
            });
          }
        } else {
          // Just thinking, no tool calls - combine into single assistant message
          // This happens when GM produces final content with <thinking> tags
          const thinkingText = part.gmThinking.join("\n\n");
          messages.push({
            role: "assistant",
            content: cleanString(`<thinking>\n${thinkingText}\n</thinking>`),
          });
        }
      } else if (part.gmStoryContext) {
        // No thinking but has GM context - include as assistant summary
        messages.push({
          role: "assistant",
          content: cleanString(`[GAME MASTER]\n${part.gmStoryContext}`),
        });
      }

      // Add the story output as assistant response AFTER GM thinking
      // This shows the GM what narrative was generated from their decisions
      // Skip if gmConversation was used (story is already in there)
      // Also skip if this is a GM-direct output (gmThinking exists but no gmToolCalls)
      const hasGmConversation =
        part.gmConversation && part.gmConversation.length > 0;
      const isGMDirectOutput =
        part.gmThinking?.length && !part.gmToolCalls?.length;
      if (
        part.content &&
        part.content.trim() &&
        !hasGmConversation &&
        !isGMDirectOutput
      ) {
        messages.push({
          role: "assistant",
          content: cleanString(`[STORY OUTPUT]\n${part.content}`),
        });
      } else if (
        part.content &&
        part.content.trim() &&
        !hasGmConversation &&
        isGMDirectOutput
      ) {
        // GM wrote the story directly - just add it without the [STORY OUTPUT] marker
        // since it's a continuation of the GM's response
        messages.push({
          role: "assistant",
          content: cleanString(part.content),
        });
      }
    }
  }

  // Add the current player action as the final user message
  // Story context is now in the previous assistant message, so just include the action
  const playerActionMessage = `> ${userChoice.replace(
    /^>\s*/,
    ""
  )}\n\n**INSTRUCTIONS:**\n1. First, check read through the Game Mechanics Notes if needed.?\n2. User reasoning and planning before talking back to the player.\n3. **Call the tool(s)** with correct parameters\n\nYou MUST call at least one tool or as many as you need to handle the player's action properly. Do not skip tool calls!\n4. Finally, write the story output the player will see, based on the tool results. Remember to keep it immersive and engaging!`;

  messages.push({
    role: "user",
    content: cleanString(playerActionMessage),
  });

  // Add prefill for tool calling (may be stripped by API for some providers)
  messages.push({ role: "assistant", content: GM_STAGE_AFFIRMATION });

  // Count how many parts have GM history (new or legacy format)
  const partsWithGMHistory = partsToInclude.filter(
    (p) =>
      !p.user &&
      (p.gmConversation?.length ||
        p.gmThinking?.length ||
        p.gmToolCalls?.length)
  ).length;
  const partsWithNewFormat = partsToInclude.filter(
    (p) => !p.user && p.gmConversation?.length
  ).length;

  // Debug logging
  console.log(
    `[buildGMStagePrompt] Context budget: ${totalContextBudget} tokens (history: ${historyBudget}, info: ${infoBudget})`
  );
  console.log(`  - System prompt: ${estimateTokens(systemPrompt)} tokens`);
  console.log(`  - State message: ${estimateTokens(stateMessage)} tokens`);
  console.log(
    `  - Chat history: ${recentParts.length} parts (${partsWithGMHistory} with GM data, ${partsWithNewFormat} with new gmConversation format)`
  );
  console.log(`  - Available tools: ${toolsToUse.length}`);

  return {
    messages,
    tools: toolsToUse.map((t: any) => ({
      type: "function",
      function: t.function,
    })),
  };
}
/**
 * Builds a simple continuation prompt for story writing after GM thinking completes.
 * This is appended to the GM conversation to continue in the same context.
 */
export function buildStoryContinuationPrompt(
  storytellerMode: StorytellerMode = "narrator"
): string {
  const basePrompt = `Now write the story from the player's perspective.`;

  const narratorGuidelines = `
Write immersive prose - show, don't tell. No dice results or mechanical language.
Use vivid sensory details. 2-4 paragraphs.`;

  const dmGuidelines = `
Write as a Dungeon Master narrating to the player. You may reference dice results naturally.
Use second person ("You swing your sword..."). 2-4 paragraphs.`;

  return (
    basePrompt + (storytellerMode === "dm" ? dmGuidelines : narratorGuidelines)
  );
}
