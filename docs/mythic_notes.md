# Advanced RPG Tools - Implementation Notes

## Currently Implemented (Complete)

### Core Fate Mechanics

- ✅ Fate Questions (Yes/No oracle with 11 likelihood levels)
- ✅ Chaos Factor support (1-9)
- ✅ Random Event detection (on doubles: 11, 22, 33, etc.)
- ✅ Event Focus generation (11 categories from page 38)
- ✅ Event Meaning generation (Action + Subject pairs)

### Extended Meaning Tables (40+ Categories)

- ✅ Character elements (descriptors, appearance, background, personality, motivations, skills, identity, conversations, actions)
- ✅ Location elements (city, civilization, cavern, domicile, dungeon, forest, starship, terrain)
- ✅ Creature elements (abilities, descriptors, alien species, undead, animal actions, gods)
- ✅ Object elements (objects, magic items, spell effects, powers, mutations)
- ✅ Atmosphere elements (sounds, smells, adventure tone)
- ✅ Narrative elements (plot twists, cryptic messages, curses, legends, visions/dreams, noble houses)
- ✅ Combat elements (character combat actions, army descriptors, dungeon traps)
- ✅ Utility elements (scavenging results, names)

### Choice-Based Integration (NEW - ACTIVE)

Advanced RPG Tools is now integrated directly into player choices. Adventure creators can add oracle checks to any choice:

**`mythic_check`** - Ask the fate oracle a yes/no question

- Format: `"question (likelihood)"` or just `"question"` (defaults to 50/50)
- Example: `"Is the door locked? (Likely)"`
- Likelihood options: Impossible, No Way, Very Unlikely, Unlikely, 50/50, Somewhat Likely, Likely, Very Likely, Near Sure Thing, A Sure Thing, Has To Be
- Uses `StoryData.mythicState.chaosFactor` (default 5) for random event detection
- Output appears in user choice text:
  ```
  [Mythic Question: Is the door locked?]
  [Mythic Answer: Yes - RANDOM EVENT TRIGGERED!]
  >Try to open the door
  ```

**`mythic_table`** - Roll on a Mythic element table

- Format: Element category name (e.g., `"character_descriptors"`, `"locations"`, `"sounds"`)
- 40+ available categories (full list below)
- Output in choice text:
  ```
  [Mythic Character Descriptors Table: Mysterious]
  [Mythic Sounds Table: Creaking]
  >Investigate the noise
  ```

**Example Choice with Mythic:**

```typescript
{
  text: "Sneak past the guard",
  skill_used: "Stealth",
  skill_dc: 60,
  mythic_check: "Is the guard asleep? (Likely)",
  mythic_table: "sounds"
}
```

**Full Choice Output:**

```
[Mythic Question: Is the guard asleep?]
[Mythic Answer: Yes]
[Mythic Sounds Table: Creaking]
[Stealth: success]
>Sneak past the guard
```

The AI receives this full context and interprets the oracle results narratively.

**Available Element Tables:**
adventure_tone, alien_species, animal_actions, army, cavern, character_actions_combat, character_actions_general, character_appearance, character_background, character_conversations, character_descriptors, character_identity, character_motivations, character_personality, character_skills, character_traits_flaws, characters, city, civilization, creature_abilities, creature_descriptors, cryptic_message, curses, domicile, dungeon, dungeon_traps, forest, gods, legends, locations, magic_item, mutation, names, noble_house, objects, plot_twists, powers, scavenging_results, smells, sounds, spell_effects, starship, terrain, undead, visions_dreams

### Mythic State (StoryData.mythicState)

```typescript
interface MythicState {
  chaosFactor: number; // 1-9, default 5
  threads: MythicThread[]; // Active story threads
  characters: MythicCharacter[]; // Known NPCs
  sceneCount: number; // Number of scenes played
}
```

Currently:

- `chaosFactor` is read by choice-based `mythic_check` for fate questions
- `threads` and `characters` arrays exist but no management tools yet
- `sceneCount` not yet incremented automatically

## Missing Features (High Priority)

### 1. Scene Alteration System (Page 20-21)

**Current Issue**: We have `check_scene` but it's not using the proper Mythic rules.

**Proper Implementation**:

```typescript
// Scene Check (d10 roll)
// If roll ≤ Chaos Factor: Scene is Altered
// If roll ≤ (Chaos Factor / 2): Scene is Interrupted
// Otherwise: Scene is Normal

export function checkScene(chaosFactor: number): {
  sceneType: "Normal" | "Altered" | "Interrupted";
  roll: number;
} {
  const roll = Math.floor(Math.random() * 10) + 1; // d10

  if (roll <= Math.floor(chaosFactor / 2)) {
    return { sceneType: "Interrupted", roll };
  } else if (roll <= chaosFactor) {
    return { sceneType: "Altered", roll };
  }

  return { sceneType: "Normal", roll };
}
```

**When Interrupted**: Generate a random event and that becomes the scene instead
**When Altered**: The expected scene happens, but with a twist (ask Fate Questions to determine how)

### 2. Chaos Factor Management (Page 28)

**Purpose**: Dynamic story pacing - increases when things get chaotic, decreases when resolved

**Adjustments**:

- **Increase Chaos** when:
  - Conflict escalates unexpectedly
  - PC expectations subverted
  - Thread closed in an unexpected way
  - Random events occur
- **Decrease Chaos** when:
  - Conflict resolves as expected
  - PC expectations met
  - Thread closed in an expected way
  - Order restored

**Implementation**:

```typescript
export function adjustChaosFactor(
  currentChaos: number,
  adjustment: -1 | 0 | 1
): number {
  return Math.max(1, Math.min(9, currentChaos + adjustment));
}
```

**Tool for AI**:

```typescript
{
  name: "adjust_chaos",
  description: "Adjust the Chaos Factor based on story developments. Higher chaos = more unpredictable events. Use sparingly and explain why.",
  parameters: {
    adjustment: {
      type: "number",
      enum: [-1, 0, 1],
      description: "-1: order restored; 0: no change; +1: chaos escalates"
    },
    reason: {
      type: "string",
      description: "Explanation for the chaos adjustment"
    }
  }
}
```

### 3. Thread Management (Page 29-30)

**Purpose**: Track active story threads (plot lines) for random event context

**Implementation**:

```typescript
export interface StoryThread {
  id: string;
  description: string;
  status: "active" | "closed";
  createdAt: number;
}

// Tools:
// add_thread - Add new plot thread
// close_thread - Resolve a thread
// list_threads - View active threads (for AI context)
```

**Why Important**: Random events can reference threads ("Move toward a thread", "Move away from a thread", "Close a thread")

### 4. Character/NPC List (Page 31)

**Purpose**: Track NPCs for random event context

**Implementation**:

```typescript
export interface MythicCharacter {
  id: string;
  name: string;
  role: string;
  status: "active" | "deceased" | "departed";
  createdAt: number;
}

// Tools:
// add_character - Add NPC to list
// update_character - Change NPC status
// list_characters - View active NPCs
```

**Why Important**: Random events can reference NPCs ("NPC action", "NPC positive", "NPC negative")

### 5. State Tracking

**Complete Mythic State**:

```typescript
export interface MythicState {
  chaosFactor: number; // 1-9, default 5
  threads: StoryThread[]; // Active plot threads
  characters: MythicCharacter[]; // Known NPCs
  sceneCount: number; // Scenes played
}
```

Should be stored in StoryData alongside stats/inventory/etc.

## Missing Features (Medium Priority)

### 6. Complex Questions (Page 32)

For multi-part questions, ask multiple Fate Questions and interpret combined results.

**Example**:

- Q1: "Is the door locked?" → Yes
- Q2: "Can I pick it?" → Yes, but...
- Result: Door is locked but pickable with some difficulty

**Implementation**: Just documentation/prompting - AI should know to break complex questions into multiple `ask_fate` calls.

### 7. Detail Check (Page 81)

When you need more specific details about something, roll on two meaning tables and interpret.

**Example**:

- "What's special about this sword?"
- Roll: "Playfully" + "Powerful"
- Interpretation: Sword is powerful but looks whimsical/toy-like

**Implementation**: Add tool `generate_detail` that rolls on two descriptor tables.

### 8. Descriptor Check (Page 83)

Combine multiple meaning tables for rich descriptions.

**Example**:

- Action + Description: "Hastily" + "Old"
- Result: Something old that was done in a hurry

**Implementation**: Already partially implemented via `generateComplexMeaning()` and `generateDetail()`, just needs tool exposure.

## Missing Features (Low Priority)

### 9. Pacing Moves (Page 86)

Optional mechanics for story pacing control:

- **Breath**: Slow down, explore, character development
- **Beat**: Speed up, advance plot
- **Surge**: Major dramatic event

**Implementation**: Tool for AI to signal pacing intent.

### 10. Behavior Check (Page 84)

When unsure how an NPC acts, roll on behavior tables.

**Implementation**: Could be another element category.

## Current Technical Limitation

**Issue**: Mythic tool results happen after story generation in the same turn, but ARE sent to AI in the next turn.

**Current Flow**:

1. AI generates story text
2. AI makes tool calls (ask_fate, generate_element, etc.)
3. Tools execute and return results
4. Results are stored in `pendingCommandResponses` state
5. **Results ARE sent to AI in next generation** via `formatResponsesForAI()` in system prompt under "Command Feedback from previous actions"
   - Format: `✓ Q: Is the door locked? → No (rolled 67) [RANDOM EVENT TRIGGERED!]`
6. **Results are NOT currently shown to user** (no UI display of tool responses)

**Problem**:

- The AI can't reference tool results in the SAME story output it just generated
- The AI CAN see and reference results in the NEXT turn (they appear in commandResponses)
- User doesn't see what the oracle said (no visual feedback)

**Example**:

- Turn 1: AI writes "You approach a mysterious door" + calls `ask_fate("Is the door locked?", "Likely")`
- Between turns: Tool executes, returns "Yes (rolled 23)"
- Turn 2: AI sees in system prompt: `✓ Q: Is the door locked? → Yes (rolled 23)` and can write "As you discovered, the door is indeed locked..."
- User never saw the fate question or result directly

**Potential Solutions**:

1. **Pre-generation Tool Phase** (Recommended for better narrative flow):
   - Allow AI to make tool calls BEFORE generating story
   - Show tool results to AI
   - Then AI generates story with full context
   - Pros: Most natural, AI can plan with oracle guidance
   - Cons: Two API calls per turn, higher latency and cost
2. **Add UI Display for Tool Responses** (Simple fix for visibility):
   - Show tool responses to user after each story part (like notifications)
   - User sees: "🎲 Oracle: Is the door locked? → Yes (rolled 23)"
   - Pros: Easy to implement, gives user visibility, no API changes
   - Cons: Doesn't solve AI timing issue, just makes it visible
3. **Two-stage Generation**:
   - Stage 1: AI plans and makes tool calls
   - Stage 2: AI sees results and generates story
   - Pros: Clear separation of planning vs execution
   - Cons: Complexity, higher cost
4. **Retroactive References** (Current State):

   - Accept the limitation: AI uses oracle results in next turn only
   - Pros: No changes needed, already works
   - Cons: Less immersive, AI writes "blind" for current turn, user doesn't see oracle activity

5. **System Message Injection**:
   - Inject tool results into a hidden system message mid-generation
   - May require API that supports mid-stream message injection
   - Pros: No extra API calls
   - Cons: Complex implementation, limited API support

**Current Recommendation**:

- **Short term**: Add UI display for tool responses so users can see oracle activity (solution #2)
- **Long term**: Implement pre-generation tool phase for natural solo RPG flow (solution #1)

## Integration with Story System

### Where to Store Mythic State

```typescript
// Add to StoryData interface
interface StoryData {
  // ... existing fields ...
  mythicState?: {
    chaosFactor: number;
    threads: Array<{ id: string; description: string; status: string }>;
    characters: Array<{
      id: string;
      name: string;
      role: string;
      status: string;
    }>;
    sceneCount: number;
  };
}
```

### When to Use Mythic Tools

**AI Should Use**:

- `ask_fate` - When uncertain about world details the player hasn't established
- `check_scene` - At the start of each scene to determine if expectations are met
- `generate_event` - When a random event is triggered (doubles on d100)
- `generate_element` - To add rich details to descriptions
- `generate_name` - When NPCs or locations need names on the fly
- `adjust_chaos` - After major story developments
- `add_thread` - When new plot threads emerge
- `add_character` - When NPCs are introduced

**AI Should NOT Use**:

- For details the player has already established
- For basic skill checks (use RPG system instead)
- When the answer is obvious from context

## Implementation Priority

### Phase 1 (Next Steps)

1. ✅ Fix scene check to use proper d10 mechanics
2. ⏳ Add Mythic state to StoryData
3. ⏳ Implement chaos management tools
4. ⏳ Implement thread management tools
5. ⏳ Implement character list tools

### Phase 2 (Future)

6. ⏳ Pre-generation tool phase (solve technical limitation)
7. ⏳ Detail/descriptor check tools
8. ⏳ Pacing move tools
9. ⏳ UI to view Mythic state (chaos factor, threads, characters)

### Phase 3 (Polish)

10. ⏳ Tutorial/guide for using Advanced RPG Tools
11. ⏳ Preset Mythic configurations (high chaos, low chaos, etc.)
12. ⏳ Analytics on Fate Question outcomes
13. ⏳ Thread/character relationship graph visualization

## Resources

- Advanced RPG Tools 2nd Edition by Tana Pigeon
- Scene checks: Page 20-21
- Chaos Factor: Page 28
- Threads: Page 29-30
- Characters: Page 31
- Complex Questions: Page 32
- Random Events: Page 38
- Meaning Tables: Pages 48-49
- Detail Check: Page 81
- Descriptor Check: Page 83
- Behavior Check: Page 84
- Pacing Moves: Page 86
- Element Tables: Pages 88-102
