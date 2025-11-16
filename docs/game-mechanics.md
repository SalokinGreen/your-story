# Game Mechanics

This document explains all game mechanics in Your Story: stats, resources, items, skill checks, and commands.

## Core Systems

### Momentum

**Purpose**: Metacurrency that gives players agency to influence dice rolls and guarantee success on critical moments.

**Structure**:
```typescript
interface StoryData {
  momentum: number;      // Current momentum (0-maxMomentum)
  maxMomentum: number;   // Maximum momentum (typically 5)
  // ...
}
```

**Earning Momentum**:
- **Critical Success**: Roll 100 → Earn 2 momentum
- **Strong Success**: Beat DC by 20+ → Earn 1 momentum
- **AI Rewards**: `/modify_momentum: +1` for exceptional roleplay or clever solutions
- **Story Milestones**: AI can grant momentum for reaching key plot points

**Spending Momentum**:
- **Reroll (1⚡)**: Roll again and take the better result
  - Works with advantage/disadvantage
  - Select before making your choice
  - Cannot be used after seeing the roll
- **Guaranteed Success (2⚡)**: Automatically pass the skill check
  - No roll needed
  - Cannot earn momentum from guaranteed successes
  - Use for critical story moments

**Rules**:
- Momentum is capped at maxMomentum (default: 5)
- Momentum persists across the entire story
- Cannot earn momentum when using Guarantee
- AI can rarely deduct momentum (`/modify_momentum: -1`) for narrative-breaking choices

**UI Display**:
- Shown on story page as dots (⚡⚡⚡○○)
- Buttons appear when a choice has a skill check
- Button text shows cost and effect
- Stats page shows detailed momentum info

**Examples**:
```typescript
// Scenario 1: Normal success with strong roll
Roll: 45, Stealth: 60, DC: 85
Total: 45 + 60 = 105 ≥ 85
Result: Success! Beat DC by 20 → Earn 1 momentum

// Scenario 2: Using reroll
Roll: 78, Stealth: 60, DC: 120
Player spends 1 momentum for reroll
Reroll: 52
Total: 52 + 60 = 112 ≥ 120
Result: Still fails, but had a chance

// Scenario 3: Guaranteed success
DC: 150 (very hard)
Player spends 2 momentum
Result: Automatic success, no roll needed
```

### Stats

**Purpose**: Character attributes that define capabilities.

**Structure**:
```typescript
interface Stat {
  name: string;          // e.g., "Strength", "Stealth"
  value: number;         // 0-100 (percentage)
  description: string;   // What the stat represents
  symbol: string;        // Display icon (e.g., "💪")
  custom_symbol_url?: string;
}
```

**Usage**:
- Used in skill checks: `Roll + Stat Value >= DC`
- Modified by AI commands: `/modify_stat: Strength(+5)`
- Displayed in stats page

**Examples**:
- Strength: 65% → Good at physical tasks
- Stealth: 30% → Poor at sneaking
- Charisma: 80% → Excellent at persuasion

### Resources

**Purpose**: Consumable values that can be spent and replenished.

**Structure**:
```typescript
interface Resource {
  name: string;          // e.g., "Health", "Stamina"
  value: number;         // Current amount
  maxValue: number;      // Maximum amount
  description: string;
  symbol: string;
  custom_symbol_url?: string;
}
```

**Usage**:
- **resource_used**: Consumes 10% of maxValue (minimum 1)
- **risked_resource**: Lost 20% of maxValue on failure
- Modified by AI: `/modify_resource: Health(-10)`
- Clamped: 0 ≤ value ≤ maxValue

**Examples**:
```typescript
{
  name: "Health",
  value: 75,
  maxValue: 100,
  description: "Physical wellbeing"
}

// Using resource: 75 - 10 = 65
// Risking on failure: 65 - 20 = 45
```

### Inventory Items

**Purpose**: Equipment that provides advantages or can be consumed.

**Structure**:
```typescript
interface InventoryItem {
  name: string;          // e.g., "Healing Potion"
  quantity: number;      // How many you have
  description: string;
  type: string;          // e.g., "consumable", "equipment"
  stat: string;          // Related stat (if any)
  resource: string;      // Related resource (if any)
  symbol: string;
  custom_symbol_url?: string;
}
```

**Mechanics**:

1. **Item Present**: Roll with **advantage** (roll twice, take lower)
2. **Item Missing**: Roll with **disadvantage** (roll twice, take higher)
3. **Item Loss**: Consumed regardless of success/failure
4. **Failure Loss**: Only lost if check fails

**Example Flow**:
```typescript
Choice: "Climb the wall <use_item: Rope; item_loss: false>"

// Player has Rope
Roll 1: 45
Roll 2: 62
Advantage → Use 45 (better)

// Player missing Rope
Roll 1: 45
Roll 2: 62
Disadvantage → Use 62 (worse)
```

### Achievements

**Purpose**: Milestones that recognize player accomplishments.

**Structure**:
```typescript
interface Achievement {
  title: string;
  description: string;
  dateAchieved: Date | null;
  points: number;
  symbol: string;
  custom_symbol_url?: string;
}
```

**Unlocking**:
- AI issues command: `/add_achievement: Dragon Slayer`
- Shows toast: "🏆 Achievement Unlocked: Dragon Slayer"
- Prevents duplicates
- Stored in `storyData.achievements`

## Skill Checks

### Dice Rolling

**System**: D100 (1-100)

```typescript
let dice_roll = Math.floor(Math.random() * 100) + 1;
```

### Difficulty Class (DC)

**Formula**: `Roll + Stat Value >= DC`

**Example**:
```typescript
// Choice with DC 75
Stealth stat: 45
skill_dc: 75

Roll: 38
Total: 38 + 45 = 83

// Success because 83 ≥ 75
```

### Success Conditions

```typescript
const total = dice_roll + stat_value;
const dc_passed = dice_roll === 100 || total >= dc;
```

1. **Critical Success**: Roll = 100 (always succeeds)
2. **Normal Success**: Roll + Stat Value ≥ DC
3. **Failure**: Roll + Stat Value < DC

### Advantage/Disadvantage

**Advantage** (Roll twice, take **lower**):
- Item is present
- Lower number = better chance to succeed

```typescript
Roll 1: 45
Roll 2: 78
Advantage → Use 45
```

**Disadvantage** (Roll twice, take **higher**):
- Required item is missing
- Higher number = worse chance to succeed

```typescript
Roll 1: 23
Roll 2: 67
Disadvantage → Use 67
```

### Complete Check Flow

```typescript
1. User selects choice with skill_used
2. Check if item_used exists in inventory
   - Present → Advantage (roll twice, take lower)
   - Missing → Disadvantage (roll twice, take higher)
3. Calculate Total = roll + stat.value
4. Compare total >= DC
   - Success → Continue normally
   - Failure → Apply penalties (resource loss, item loss)
5. Notify user of result
```

## Choice Metadata

Choices can include optional metadata that triggers mechanics:

```typescript
interface Choice {
  text: string;              // Display text
  skill_used?: string;       // Stat name for check
  skill_dc?: number;         // Difficulty modifier
  item_used?: string;        // Required/helpful item
  item_loss?: boolean;       // Consume item?
  resource_used?: string;    // Resource to spend
  risked_resource?: string;  // Resource at risk on failure
}
```

### Syntax in AI Output

```
<use_skill: Stealth (DC 50); use_item: Rope; item_loss: true; use_resource: Stamina; risk_resource: Health>
```

**Parsed to**:
```typescript
{
  text: "Sneak past the guards",
  skill_used: "Stealth",
  skill_dc: 50,
  item_used: "Rope",
  item_loss: true,
  resource_used: "Stamina",
  risked_resource: "Health"
}
```

## AI Commands

The AI can modify game state using commands in the `<commands>` block.

### Command Syntax

```
<commands>
/modify_item: item name(amount)
/modify_stat: stat name(amount)
/modify_resource: resource name(amount)
/add_achievement: achievement title
</commands>
```

### /modify_item: name(amount)

**Add Items**:
```
/modify_item: Healing Potion(+3)
```
- Adds 3 Healing Potions to inventory
- Creates new item if doesn't exist
- Notification: "Added 3 Healing Potion"

**Remove Items**:
```
/modify_item: Rope(-1)
```
- Removes 1 Rope
- Deletes item if quantity reaches 0
- Notification: "Removed 1 Rope from inventory"

### /modify_stat: name(amount)

**Increase Stat**:
```
/modify_stat: Strength(+10)
```
- Increases Strength by 10
- Clamped: 0 ≤ value ≤ 100
- Notification: "Strength: 45 → 55" (green)

**Decrease Stat**:
```
/modify_stat: Charisma(-5)
```
- Decreases Charisma by 5
- Notification: "Charisma: 70 → 65" (yellow)

### /modify_resource: name(amount)

**Restore Resource**:
```
/modify_resource: Health(+25)
```
- Increases Health by 25
- Clamped: 0 ≤ value ≤ maxValue
- Notification: "Health: 50 → 75/100" (green)

**Drain Resource**:
```
/modify_resource: Stamina(-15)
```
- Decreases Stamina by 15
- Notification: "Stamina: 80 → 65/100" (yellow)

### /add_achievement: title

```
/add_achievement: First Blood
```
- Creates new achievement
- Ignores duplicates
- Notification: "🏆 Achievement Unlocked: First Blood" (green)
- Displayed in achievements list with unlock date

### /modify_momentum: amount

**Award Momentum**:
```
/modify_momentum: +1
```
- Increases momentum by 1
- Clamped: 0 ≤ value ≤ maxMomentum
- Notification: "⚡ Momentum: 3 → 4/5" (green)
- Use for: Exceptional roleplay, clever solutions, story milestones

**Deduct Momentum** (rare):
```
/modify_momentum: -1
```
- Decreases momentum by 1
- Notification: "⚡ Momentum: 4 → 3/5" (yellow)
- Use sparingly for: Extremely reckless or narrative-breaking choices

**Guidelines**:
- Reward momentum to encourage creative play
- Don't over-reward (1 momentum per milestone is sufficient)
- Avoid deducting momentum unless absolutely necessary
- Remember: Players earn momentum automatically from strong rolls

### /mark_beat: index
- Sets dateAchieved to current time
- Default: 10 points, 🏆 symbol
- Notification: "🏆 Achievement Unlocked: First Blood"
- Prevents duplicates

## Failure Penalties

When a skill check fails, additional penalties apply:

### 1. Risked Resource Loss

If `risked_resource` is specified:
- Lose 20% of maxValue (double normal usage)
- Minimum: 1 point
- Notification: "Lost 20 Health from failure! (55/100 remaining)"

```typescript
const loss = Math.max(1, Math.floor(resource.maxValue * 0.2));
resource.value = Math.max(0, resource.value - loss);
```

### 2. Item Loss on Failure

If `item_loss: true`:
- Item is consumed
- Quantity decremented or removed
- Notification: "Lost Rope from failure!"

```typescript
if (choice.item_loss && choice.item_used) {
  // Remove item
}
```

## Resource Usage Rates

### Standard Usage (`resource_used`)

**Rate**: 10% of maxValue (minimum 1)

```typescript
const usage = Math.max(1, Math.floor(resource.maxValue * 0.1));
resource.value = Math.max(0, resource.value - usage);
```

**Example**:
```
Health: 100 max → Uses 10 per action
Stamina: 50 max → Uses 5 per action
Mana: 200 max → Uses 20 per action
```

### Risk Loss (`risked_resource` on failure)

**Rate**: 20% of maxValue (minimum 1)

```typescript
const loss = Math.max(1, Math.floor(resource.maxValue * 0.2));
```

**Example**: Health (100 max)
- Normal use: -10
- Failed risk: -20 (double penalty)

## Notification Types

All game actions trigger notifications:

| Type | Color | Usage |
|------|-------|-------|
| **success** | Green | Check passed, stat increased, resource restored, achievement |
| **failure** | Red | Check failed, penalties applied |
| **warning** | Yellow | Item lost, resource drained, risk notification |
| **info** | Blue | Item used, resource used, general info |

**Examples**:
- ✓ Check Passed! (Stealth: 45 ≤ 75) - success
- ✗ Check Failed! (Strength: 82 > 70) - failure
- Lost 20 Health from failure! - failure
- Used item: Rope (Advantage!) - info
- Risked Health (75/100) - warning

## Story Progression

### Memory System

Key events are stored in `storyData.memory`:
- AI adds entries in `<memory>` block
- Included in future prompts for continuity
- Prevents repetition and maintains coherence

### Chapter System

Stories are divided into chapters:
- AI can end chapters with `!!! END CHAPTER !!!`
- Sets `endChapter: true` on ScenePart
- Can trigger chapter summary (future)

### Story Endings

AI can end the story with markers:
- `!!! END STORY !!!` → `endStory: true`
- `!!! GAME OVER !!!` → `gameOver: true`
- Displays ending screen (future)

## Points & Upgrade System

### Earning Points

Players earn upgrade points from story progression:

**Beat Completion**: 25 points
- AI uses `/mark_beat: index` to mark a story beat complete
- Points awarded once per beat (tracked in `earnedPointsFromBeats[]`)
- Example: `/mark_beat: 0` awards 25 points for the first beat

**Chapter Completion**: 50 points
- AI ends chapter with `!!! END CHAPTER !!!` marker
- Points awarded once per chapter (tracked in `earnedPointsFromChapters[]`)
- Larger reward for completing major story milestones

**Achievement Unlocks**: Variable points
- Future enhancement: achievements can specify custom point values
- Use `/add_achievement: title` to unlock achievements

### Spending Points

Players access the **Upgrades** tab to spend points:

**Stat Increase** (10 points):
- Increase any stat by +1
- Maximum stat value: 100
- Example: Raise Stealth from 55 to 56

**Resource Max Increase** (15 points):
- Increase any resource maximum by +10
- Current value adjusts proportionally
- Example: Health max from 100 to 110

**Add Custom Item** (20 points):
- Create a custom item for inventory
- Player defines name, description, symbol
- Can be used for advantage in future choices

### Point Balance

Current points displayed in:
- **Stats Page**: Prominent card at top showing balance and earning info
- **Upgrades Page**: Header shows current points and purchase costs

### Strategy

**Early Game**: Save points for critical stat increases to pass challenging DCs

**Mid Game**: Balance stat upgrades with resource expansion for survivability

**Late Game**: Use points for custom items to enable creative solutions

### Integration with AI

The AI is aware of the points system:
- Sees current point balance in context
- Uses `/mark_beat` to reward progression
- Times chapter endings for satisfying milestones
- Balances beat completion pacing with story flow

### Cost Constants

```typescript
export const UPGRADE_COSTS = {
    STAT_INCREASE: 10,
    RESOURCE_MAX_INCREASE: 15,
    ADD_ITEM: 20,
    CHAPTER_REWARD: 50,
    BEAT_REWARD: 25,
} as const;
```

## Complete Example

### Choice Definition
```
- Sneak past the dragon using your cloak of shadows <use_skill: Stealth (DC 60); use_item: Shadow Cloak; item_loss: false; risk_resource: Health>
```

### Scenario 1: Normal Success

**Setup**:
- Stealth: 55
- Health: 85/100
- Momentum: 3/5
- Has Shadow Cloak

**Execution Flow**:

1. **Check Item**: Player has Shadow Cloak → Advantage
2. **Roll Dice**:
   - Roll 1: 72
   - Roll 2: 48
   - Take 48 (advantage)
3. **Calculate Total**: 48 + 55 (Stealth) = 103
4. **Check Result**: 103 ≥ 60 (DC) → **Success!**
5. **Momentum**: Beat DC by 43 (more than 20) → Earn 1 momentum
6. **Notifications**:
   - "Used item: Shadow Cloak (Advantage!)" (info)
   - "Risked Health (85/100)" (warning)
   - "✓ Check Passed! (Stealth: 48 + 55 = 103 ≥ 60)" (success)
   - "⚡ Strong Success! Earned 1 Momentum! (4/5)" (success)
7. **AI Response**: Continues story from success path

### Scenario 2: Using Reroll to Succeed

**Setup**:
- Stealth: 55
- Momentum: 3/5
- DC: 120 (hard check)

**Execution Flow**:

1. **Player Action**: Spends 1 momentum for reroll before choosing
2. **First Roll**: 58
3. **Reroll**: 72
4. **Take Better Roll**: 58
5. **Calculate Total**: 58 + 55 = 113
6. **Check Result**: 113 < 120 → **Failure!**
7. **Momentum**: Now 2/5 (spent 1, didn't earn any)
8. **Notifications**:
   - "⚡ Spent 1 Momentum for Reroll! (2/5 remaining)" (info)
   - "🎲 Reroll used! Better roll: 58" (success)
   - "✗ Check Failed! (Stealth: 58 + 55 = 113 < 120)" (failure)

### Scenario 3: Guaranteed Success on Critical Moment

**Setup**:
- Momentum: 4/5
- DC: 150 (very hard - escaping collapsing cave)

**Execution Flow**:

1. **Player Action**: Spends 2 momentum for guaranteed success
2. **Result**: Automatic success, no roll needed
3. **Momentum**: Now 2/5 (spent 2, cannot earn from guarantee)
4. **Notifications**:
   - "⚡ Spent 2 Momentum for Guaranteed Success! (2/5 remaining)" (success)
   - "✓ Guaranteed Success! (Athletics: Auto-success with 2 Momentum)" (success)
5. **AI Response**: Epic description of narrow escape

### Scenario 4: Critical Success

**Setup**:
- Stealth: 55
- Momentum: 4/5 (near max)
- DC: 100

**Execution Flow**:

1. **Roll**: 100 (critical!)
2. **Calculate Total**: 100 + 55 = 155
3. **Check Result**: Automatic success (roll = 100)
4. **Momentum**: Earn 1 momentum (only 1 because already at 4/5)
5. **Notifications**:
   - "✓ Check Passed! (Stealth: 100 + 55 = 155 ≥ 100)" (success)
   - "⚡ Critical Success! Earned 1 Momentum! (5/5)" (success)
6. **AI Response**: Spectacular success with extra narrative reward

### Scenario 5: Failure with Penalties

**Setup**:
- Stealth: 55
- Health: 85/100
- Momentum: 2/5
- DC: 160 (very hard)

**Execution Flow**:

1. **Roll**: 92
2. **Calculate Total**: 92 + 55 = 147
3. **Check Result**: 147 < 160 → **Failure!**
4. **Penalties**:
   - Lose 20 Health (20% of 100)
   - Health: 85 → 65
5. **Notifications**:
   - "✗ Check Failed! (Stealth: 92 + 55 = 147 < 160)" (failure)
   - "Lost 20 Health from failure! (65/100 remaining)" (failure)
6. **AI Response**: Describes consequences of failure

## Best Practices

### For Story Creators

1. **Set Reasonable DCs** (assuming average stat of 50):
   - DC 20-40: Trivial (auto-succeed with any roll)
   - DC 50-70: Very Easy (succeed on 1-20)
   - DC 80-100: Easy (succeed on 30-50)
   - DC 110-130: Medium (succeed on 60-80)
   - DC 140-160: Hard (succeed on 90-100)
   - DC 160+: Very Hard (requires high stats or momentum)

2. **Balance Resources**:
   - Don't risk resources on easy checks
   - Use items for critical moments
   - Consider failure states

3. **Meaningful Choices**:
   - Each choice should feel distinct
   - Failures should be interesting, not punishing
   - Successes should feel rewarding

4. **Momentum Economy**:
   - Give players opportunities to earn momentum through strong play
   - Design some high-DC challenges that tempt momentum spending
   - Reward creative solutions with bonus momentum via `/modify_momentum`
   - Don't over-reward - momentum should feel earned and special

### For Developers

1. **Validate Commands**: Check item/stat/resource existence
2. **Clamp Values**: Prevent negative or overflow
3. **Notify Users**: Always provide feedback
4. **Test Edge Cases**: Empty inventory, zero resources, max stats

## Next Steps

- [AI Integration](./ai-integration.md) - How AI generates choices
- [Story Creation](./story-creation.md) - Writing compelling stories
- [API Reference](./api-reference.md) - Technical details

---

*Last updated: November 15, 2025*
