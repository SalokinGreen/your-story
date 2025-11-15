# Game Mechanics

This document explains all game mechanics in Your Story: stats, resources, items, skill checks, and commands.

## Core Systems

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
- Used in skill checks: `DC = stat.value + skill_dc`
- Modified by AI commands: `/modify_stat: Strength(+5)`
- Displayed in stats page (future)

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

**Formula**: `DC = stat_value + skill_dc`

**Example**:
```typescript
// Choice with DC 30
Stealth stat: 45%
skill_dc: 30

DC = 45 + 30 = 75

// Success if roll ≤ 75
```

### Success Conditions

```typescript
const dc_passed = dice_roll === 1 || dice_roll <= dc;
```

1. **Critical Success**: Roll = 1 (always succeeds)
2. **Normal Success**: Roll ≤ DC
3. **Failure**: Roll > DC

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
3. Calculate DC = stat.value + skill_dc
4. Compare roll ≤ DC
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

## Complete Example

### Choice Definition
```
- Sneak past the dragon using your cloak of shadows <use_skill: Stealth (DC 60); use_item: Shadow Cloak; item_loss: false; risk_resource: Health>
```

### Execution Flow

1. **Check Item**: Player has Shadow Cloak → Advantage
2. **Roll Dice**:
   - Roll 1: 72
   - Roll 2: 48
   - Take 48 (advantage)
3. **Calculate DC**: Stealth (55) + 60 = 115
4. **Check Result**: 48 ≤ 115 → **Success!**
5. **Notifications**:
   - "Used item: Shadow Cloak (Advantage!)" (info)
   - "Risked Health (85/100)" (warning)
   - "✓ Check Passed! (Stealth: 48 ≤ 115)" (success)
6. **AI Response**: Continues story from success path

### If Failed

Same setup, but roll 48 and 92 → Take 92

1. **Check Result**: 92 > 115 → **Failure!**
2. **Penalties**:
   - Lose 20 Health (20% of 100)
   - Health: 85 → 65
3. **Notifications**:
   - "✗ Check Failed! (Stealth: 92 > 115)" (failure)
   - "Lost 20 Health from failure! (65/100 remaining)" (failure)
4. **AI Response**: Continues story from failure path

## Best Practices

### For Story Creators

1. **Set Reasonable DCs**:
   - DC 1-20: Very Easy
   - DC 21-40: Easy
   - DC 41-60: Medium
   - DC 61-80: Hard
   - DC 81-100: Very Hard

2. **Balance Resources**:
   - Don't risk resources on easy checks
   - Use items for critical moments
   - Consider failure states

3. **Meaningful Choices**:
   - Each choice should feel distinct
   - Failures should be interesting, not punishing
   - Successes should feel rewarding

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
