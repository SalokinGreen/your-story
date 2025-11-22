# Choice System Architecture

This document describes how player choices flow through the system, from selection to AI generation to result display.

## Overview

The choice system is the core gameplay loop:

1. AI presents player with choices (each may have skill checks, items, resources)
2. Player selects choice or submits custom input
3. System validates and executes choice mechanics (rolls, checks, penalties)
4. Choice details are formatted with rich context
5. AI receives choice + context and generates next story part
6. System parses AI response and updates story state

**Primary Location**: [`app/story/page.tsx`](../app/story/page.tsx) (`handleChoice()` and `handleCustomInput()` functions)

---

## Flow Diagram

```
┌─────────────────────┐
│ AI Generates Choices │
│ <choices>           │
│  - Option 1         │
│  - Option 2 (DC)    │
│ </choices>          │
└──────────┬──────────┘
           │
           v
┌─────────────────────┐
│ Player Selects      │
│ Choice              │
└──────────┬──────────┘
           │
           v
┌─────────────────────┐
│ Validate Choice     │
│ - Check item exists │
│ - Check resources   │
│ - Calculate adv/dis │
└──────────┬──────────┘
           │
           v
┌─────────────────────┐
│ Execute Skill Check │
│ (if DC specified)   │
│ - Roll dice         │
│ - Apply advantages  │
│ - Check success     │
│ - Track explosions  │
│   partial, tie, etc │
└──────────┬──────────┘
           │
           v
┌─────────────────────┐
│ Apply Consequences  │
│ - Consume items     │
│ - Break items       │
│ - Gain/lose res     │
│ - Trigger panic     │
└──────────┬──────────┘
           │
           v
┌─────────────────────┐
│ Format Choice       │
│ Details             │
│ [Skill: result      │
│  (context)]         │
│ > Choice text       │
└──────────┬──────────┘
           │
           v
┌─────────────────────┐
│ Send to AI          │
│ - Full story state  │
│ - Recent history    │
│ - Choice details    │
└──────────┬──────────┘
           │
           v
┌─────────────────────┐
│ Parse AI Response   │
│ - Extract <story>   │
│ - Extract <memory>  │
│ - Extract <choices> │
│ - Parse commands    │
└──────────┬──────────┘
           │
           v
┌─────────────────────┐
│ Update Story State  │
│ - Add scene part    │
│ - Update memory     │
│ - Display choices   │
│ - Apply commands    │
└─────────────────────┘
```

---

## Choice Object Structure

```typescript
interface Choice {
  text: string;              // Display text for player
  skill_used?: string;       // Skill name for check
  dc?: number;              // Difficulty class (not used for PbtA/percentile)
  resource_used?: string;   // Resource required/at-risk
  item_used?: string;       // Item required for advantage
  item_loss?: boolean;      // Whether item breaks/consumed
}
```

**Example from AI**:
```xml
<choices>
- You carefully pick the lock. <use_skill: Lockpicking (DC 15); use_resource: none; use_item: Lockpicks>
- You kick down the door loudly. <use_skill: Athletics (DC 12); use_resource: Stamina; use_item: none>
- You search for another way in. <use_skill: none; use_resource: none; use_item: none>
</choices>
```

---

## Validation Phase

### Item Validation

**Location**: `handleChoice()` line ~2210

```typescript
// Fuzzy match item name
const matchResult = findItemMatch(choice.item_used, storyData.inventory);
const item = matchResult?.item;

if (item) {
  // Item exists
  if (itemType === 'misc') {
    // Misc items: prevent disadvantage only
  } else {
    // Normal/consumable/story: grant advantage
    advantageCount++;
    advantageSources.push(item.name);
  }
  
  // Handle consumption
  if (itemType === 'consumable') {
    // Consume immediately
  } else if (itemType === 'normal') {
    // May break on failure
  }
  // Story/misc never consumed or broken
} else {
  // Item missing: disadvantage
  disadvantageCount++;
  disadvantageSources.push(`missing ${choice.item_used}`);
}
```

**Item Type Behaviors**:
- **normal**: Advantage on use, breaks on failure
- **consumable**: Advantage on use, consumed immediately
- **story**: Advantage on use, never breaks (quest items)
- **misc**: Prevents disadvantage, never breaks

### Resource Validation

**Location**: `handleChoice()` line ~2290

```typescript
const resourceReqs = calculateResourceRequirements(rpgSystem, dc);

if (resource.value < resourceReqs.required) {
  // Insufficient resources
  insufficientResource = true;
  
  // Apply dice penalty (system-specific)
  const dicePenalty = resourceReqs.penalty;
  
  // For PbtA/Fate: apply as modifier penalty
  // For roll systems: apply as roll penalty
  // For YZE/Explosive: no automatic penalty
}
```

**Resource Flow**:
1. **Before check**: Validate sufficient resources
2. **On success**: Recover some resources (DC ÷ 20)
3. **On failure**: Lose additional resources (DC ÷ 10)

### Momentum Validation

**Location**: `handleChoice()` line ~2120

```typescript
if (momentumMode === "reroll" && storyData.momentum >= 1) {
  storyData.momentum--;
  // Grant advantage on roll
} else if (momentumMode === "guarantee" && storyData.momentum >= 2) {
  storyData.momentum -= 2;
  // Auto-succeed
}
```

---

## Skill Check Execution

### Advantage/Disadvantage Calculation

**Location**: `handleChoice()` line ~2340

```typescript
// Track sources
advantageSources: string[] = [];
disadvantageSources: string[] = [];

// Sources of advantage:
// - Items (normal/consumable/story)
// - Achievements (advOn: ["skill_name"])
// - Momentum reroll
// - Misc items (prevent disadvantage)

// Sources of disadvantage:
// - Missing items
// - Achievements (disadvOn: ["skill_name"])
// - Insufficient resources (for some systems)

const netAdvantage = advantageCount - disadvantageCount;
// Clamped to ±5 max
```

### Dice Rolling

**System-Specific Rolling**:

```typescript
// Standard systems (3d6, 1d20, 1d100, percentile, PbtA, Fate)
const diceResult = rollDice(rpgSystem);
dice_roll = diceResult.total;

// Apply advantage/disadvantage
if (netAdvantage > 0) {
  // Roll additional dice, keep best/worst
  // For 3d6: roll extra dice, keep highest/lowest 3
  // For others: roll multiple times, keep best/worst
} else if (netAdvantage < 0) {
  // Disadvantage logic
}

// YZE: Variable dice pool
const baseDiceCount = Math.floor(statValue / 20);
const stressDiceCount = yzeStressDiceChoice; // Player chosen
const rolls = rollDicePool(baseDiceCount + stressDiceCount);

// Explosive: Single die with explosions
const dieSize = rpgSystem.statToDieSize(statValue);
const result = rollDice(rpgSystem, dieSize); // Auto-handles explosions
```

### Success Checking

**Location**: `handleChoice()` line ~2730

```typescript
const successResult = checkSuccess(
  rpgSystem,
  dice_roll,
  statValue,
  dc,
  penalty,
  rolls // Optional: for YZE
);

// Standard results
dc_passed = successResult.success;
isCritical = successResult.critical;
rollTotal = successResult.total;

// System-specific outcomes
if (successResult.partial) {
  // PbtA: 7-9 partial success
  skillCheckResult = "partial";
}

if (successResult.tie) {
  // Fate: margin = 0
  skillCheckResult = "tie";
} else if (successResult.style) {
  // Fate: margin ≥ 3
  skillCheckResult = "style";
}

// YZE: panic check
if (stressDice.some(die => die === 1)) {
  triggerPanic();
}
```

---

## Choice Details Formatting

**Location**: `handleChoice()` line ~3088

The system constructs rich context sent to the AI:

```typescript
let skillCheckLine = `[${choice.skill_used}: `;

// System-specific formatting
if (rpgSystem.id === "pbta" && skillCheckResult === "partial") {
  skillCheckLine += `partial success (7-9)`;
} else if (rpgSystem.id === "fate") {
  const margin = rollTotal - rollDC;
  if (skillCheckResult === "tie") {
    skillCheckLine += `tie (margin 0)`;
  } else if (skillCheckResult === "style") {
    skillCheckLine += `success with style (+${margin})`;
  } else {
    skillCheckLine += `success (margin +${margin})`;
  }
} else if (rpgSystem.id === "explosive") {
  const explosions = yzeData.explosions || 0;
  if (explosions > 0) {
    skillCheckLine += `${skillCheckResult} (d${dieSize} exploded x${explosions})`;
  } else {
    skillCheckLine += `${skillCheckResult} (d${dieSize})`;
  }
} else if (rpgSystem.id === "yze") {
  const successes = yzeData.successes || 0;
  skillCheckLine += `${skillCheckResult} (${successes} successes vs ${rollDC})`;
} else {
  // Standard systems
  skillCheckLine += skillCheckResult;
}

skillCheckLine += `]`;
choiceDetails.push(skillCheckLine);
```

### Format Examples by System

**Standard (3d6, 1d20, 1d100, Percentile)**:
```
[Lockpicking: success]
[Stealth: failure]
[Athletics: success (no skill bonus)]
```

**PbtA**:
```
[Technique: partial success (7-9)]
[Charm: success]
[Combat: failure]
```

**Fate**:
```
[Diplomacy: tie (margin 0)]
[Combat: success with style (+5)]
[Athletics: success (margin +2)]
[Stealth: failure]
```

**Explosive**:
```
[Acrobatics: success (d8 exploded x2)]
[Lockpicking: failure (d6)]
[Combat: success (d20)]
```

**YZE**:
```
[Mechanics: success (3 successes vs 2)]
[Survival: failure (1 successes vs 2)]
[PANIC! Freeze: You can't take actions for one round]
```

### Additional Details

```typescript
// Item usage
if (itemBroken) {
  choiceDetails.push(`[ItemUsed: ${item}; x${before} → broken]`);
} else if (consumed) {
  choiceDetails.push(`[ItemUsed: ${item}; x${before} → ${after}]`);
}

// Resource changes
choiceDetails.push(`[Resource: ${resource} ${before} → ${after}/${max}]`);
```

### Final Message Format

```
[SkillName: result (context)]
[ItemUsed: Lockpicks; x2 → 1]
[Resource: Stamina 45 → 50/100]
> You carefully pick the lock.
```

---

## AI Payload Construction

**Location**: `handleChoice()` line ~3150

```typescript
// Trim payload to stay under 4.5MB limit
const minimalStoryData = {
  story_name: storyData.story_name,
  premise: storyData.premise?.substring(0, 1500),
  player_name: storyData.player_name,
  rpgSystem: storyData.rpgSystem,
  stats: storyData.stats,
  resources: storyData.resources,
  inventory: storyData.inventory,
  achievements: storyData.achievements,
  lore: storyData.lore.filter(l => l.on !== false),
  // ... other minimal fields
  scene: {
    parts: recentParts // Only last 6 parts
  }
};

const payload = {
  storyData: minimalStoryData,
  userChoice: null, // Choice already added to scene parts
  model: localStorage.getItem("aiModel"),
  useRawContext: localStorage.getItem("useRawContext") === "true"
};
```

---

## AI Response Parsing

**Location**: `app/misc/ai.ts` (`outputToScenePart()`)

```typescript
// Parse AI response
const part = outputToScenePart(aiResponse);

// Extract components
part.content = extractTag(response, "story");
part.memory = extractTag(response, "memory");
part.choices = parseChoices(extractTag(response, "choices"));
part.commands = parseCommands(extractTag(response, "commands"));

// Fallback: if no <story> tags, treat entire response as story
if (!part.content) {
  part.content = response;
}
```

---

## Command Processing

**Location**: `app/story/page.tsx` (`processCommands()`)

Commands let AI modify story state:

```
/modify_stat: stat_name +5
/modify_resource: resource_name -10
/add_item: item name | description | type | quantity
/consume_item: item name
/break_item: item name
/unlock_achievement: achievement name
/deal_damage: 5
/toggle_lore: lore_title (on/off)
/advance_beat: beat_index
```

**Processing**:
1. Parse command syntax
2. Fuzzy match entity names
3. Apply state changes
4. Show notifications
5. Log actions

---

## Custom Input

**Location**: `handleCustomInput()` line ~1806

When player submits free-form text (no predefined choices):

```typescript
// Skip validation and skill checks
storyData.scene.parts.push({
  content: ">" + customText,
  user: true,
  role: "user"
});

// Send directly to AI
// AI interprets intent and may inject skill checks
```

---

## AI Interpretation Guidelines

The AI receives choice details and should respond appropriately:

### PbtA Partial Success (7-9)

**Context**: `[Technique: partial success (7-9)]`

**AI Should**:
- Achieve player's stated goal
- Add ONE of:
  - Cost (lose resource, take damage)
  - Complication (alert enemies, time pressure)
  - Hard choice (save ally OR complete objective)
  - Lesser effect (succeed imperfectly)

**Example**:
```
You successfully pick the lock, but the mechanism clicks loudly. 
You hear footsteps approaching from the hallway—time to move!
```

### Fate Tie (margin 0)

**Context**: `[Diplomacy: tie (margin 0)]`

**AI Should**:
- Succeed at minor cost or introduce complication
- "Yes, but..." outcomes

**Example**:
```
The guard agrees to let you pass, but demands you leave your 
weapon with him. He'll return it when you leave the compound.
```

### Fate Success with Style (+3+)

**Context**: `[Combat: success with style (+5)]`

**AI Should**:
- Full success PLUS bonus:
  - Extra effect beyond intent
  - Grant advantage for next action
  - Reduce incoming harm
  - Discover useful information

**Example**:
```
Your strike connects perfectly! The bandit drops his sword and 
staggers back, giving you a clear opening [+advantage on next attack].
You also notice a map sticking out of his pocket—looks important.
```

### Explosive Dice Explosions

**Context**: `[Acrobatics: success (d8 exploded x2)]`

**AI Should**:
- Describe moment dramatically (luck, heroism, improbability)
- Success should feel earned and spectacular

**Example**:
```
Against all odds, you launch yourself into the air. Your foot finds 
purchase on a loose brick, then another—each impossible foothold 
appearing just as you need it. You soar over the chasm, landing in 
a perfect roll on the far side. Even you can't believe that worked!
```

### YZE Success Count

**High Count** (3+ over DC): `[Mechanics: success (5 successes vs 2)]`
- Confident, capable outcome
- "You make it look easy"

**Low Count** (barely met DC): `[Combat: success (2 successes vs 2)]`
- Tense, barely scraped by
- "You succeed, but only just"

**Panic**: `[PANIC! Freeze: You can't take actions for one round]`
- Narrate panic effect dramatically
- Player achieved goal but panic triggers anyway

**Example**:
```
Your shot hits the alien square in the chest. It screeches and 
collapses. [SUCCESS]

But the sound of your gunshot echoing in the dark corridor, the 
alien blood splattered across your visor—it's too much. Your hands 
shake uncontrollably and you can't move. [PANIC: Freeze]
```

---

## Edge Cases

### Missing Item

**Context**: `[Stealth: failure]` with disadvantage from missing item

**System Behavior**:
- Disadvantage applied automatically
- AI receives standard failure context
- Item not mentioned in details

**AI Should**: Narrate failure without specifically mentioning missing item (player already notified).

### Insufficient Resources

**Context**: `[Athletics: success (no skill bonus)]`

**System Behavior**:
- Dice penalty applied
- Check may succeed despite penalty
- Resources depleted on failure

**AI Should**: Can mention fatigue/exhaustion if narratively appropriate.

### Momentum Guarantee

**Context**: No skill check details (auto-success)

**System Behavior**:
- No dice rolled
- Player spent 2 momentum for guaranteed success
- No context sent to AI

**AI Should**: Narrate clean success (player earned it).

### Critical Success/Failure

**Context**: Standard success/failure with `isCritical: true` flag

**System Behavior**:
- Notification shows "CRITICAL!"
- No special context to AI (currently)

**Future Enhancement**: Could send `[SkillName: critical success]` for dramatic AI responses.

---

## Performance Considerations

### Payload Size

- Story data trimmed to <4.5MB (Vercel limit)
- Only last 6 scene parts sent
- Text fields capped (premise: 1500 chars, notes: 800 chars)
- Heavy nested data stripped from history

### Fuzzy Matching

- Item/stat/resource names fuzzy matched (AI may use slight variations)
- Match threshold: 70% similarity
- Logs matched results for debugging

### Dice Animation

- 9-second delay for dice visualizer (rolling → result phases)
- User can skip with click or keyboard (Enter/Space/Escape)
- No state changes until animation completes (prevents race conditions)

---

## Summary

The choice system creates a rich feedback loop:

1. **AI generates choices** with mechanical requirements
2. **Player selects**, triggering validation
3. **System executes mechanics**, tracking outcomes
4. **Context formatted** with system-specific details
5. **AI receives context**, adapts narrative
6. **State updated**, loop continues

Each RPG system provides different context, and the AI learns to respond appropriately—adding complications for PbtA partials, describing dramatic explosions, managing Fate aspects, or narrating YZE panic.
