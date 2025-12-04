# Testing Guide

This document covers testing strategies for Your Story, including unit tests, manual testing checklists, and debugging approaches.

## Unit Tests (Vitest)

**Location**: `tests/` directory  
**Command**: `npm run test`  
**Framework**: Vitest with TypeScript support

### Running Tests

```bash
# Run all tests
npm run test

# Run specific test file
npm run test rpgSystems.core.test.ts

# Run tests in watch mode
npm run test -- --watch

# Run with coverage
npm run test -- --coverage
```

### Test Organization

- `rpgSystems.core.test.ts`: Core dice rolling and success checking
- `rpgSystems.yze.test.ts`: YZE-specific stress/panic mechanics
- `rpgSystems.explosive.test.ts`: Explosive dice chain testing
- `advantageStacking.test.ts`: Advantage/disadvantage stacking rules
- `ai.outputToScenePart.test.ts`: AI response parsing
- `ai.context.test.ts`: AI context building
- `lore.test.ts`: Lore trigger system
- `story.processCommands.test.ts`: Command parsing and execution

### Key Test Areas

#### RPG Systems (`rpgSystems.*.test.ts`)

```typescript
describe("3d6 System", () => {
  test("rolls between 3-18", () => {
    const result = rollDice(SYSTEM_3D6);
    expect(result.total).toBeGreaterThanOrEqual(3);
    expect(result.total).toBeLessThanOrEqual(18);
  });

  test("checkSuccess compares total vs DC", () => {
    const result = checkSuccess(SYSTEM_3D6, 10, 50, 15, 0);
    expect(result.success).toBe(true); // 10 + 9 (50*0.18) = 19 >= 15
  });
});
```

#### AI Parsing (`ai.outputToScenePart.test.ts`)

```typescript
test("parses XML tags correctly", () => {
  const response = `
    <story>The dragon roars!</story>
    <memory>Dragon appeared</memory>
    <choices>
    - Attack the dragon
    - Run away
    </choices>
  `;

  const part = outputToScenePart(response);
  expect(part.content).toBe("The dragon roars!");
  expect(part.memory).toContain("Dragon appeared");
  expect(part.choices).toHaveLength(2);
});
```

#### Command Processing (`story.processCommands.test.ts`)

```typescript
test("processes stat modification", () => {
  const storyData = createTestStory();
  processCommands(["/modify_stat: Strength +5"], storyData, mockNotify);

  expect(storyData.stats.find((s) => s.name === "Strength").value).toBe(55);
});
```

---

## Manual Testing Checklist

### RPG Systems

#### 3d6 System

- [ ] Base roll is 3-18
- [ ] Stat modifier applies correctly (stat × 0.18)
- [ ] Success when roll + modifier ≥ DC
- [ ] Advantage: Roll 3 + advantage count dice, keep highest 3
- [ ] Disadvantage: Roll 3 + disadvantage count dice, keep lowest 3
- [ ] Stacking works (max ±5 extra dice)
- [ ] Notification shows selected dice from pool

#### 1d20 System

- [ ] Base roll is 1-20
- [ ] Stat modifier applies correctly (stat × 0.2)
- [ ] Success when roll + modifier ≥ DC
- [ ] Natural 1 shows as critical failure
- [ ] Natural 20 shows as critical success
- [ ] Advantage: Roll twice, keep higher
- [ ] Disadvantage: Roll twice, keep lower
- [ ] Stacking works (extra rolls per source)

#### PbtA System

- [ ] Base roll is 2d6 + modifier
- [ ] 10+ = full success (no complications)
- [ ] 7-9 = partial success
  - [ ] AI MUST add complication/cost/hard choice
  - [ ] Choice details show `[Skill: partial success (7-9)]`
- [ ] 6- = failure with consequences
- [ ] Advantage: +1 per source (stacking)
- [ ] Disadvantage: -1 per source (stacking)
- [ ] Max ±5 modifier

#### Fate System

- [ ] Base roll is 4dF (4 dice showing -1/0/+1)
- [ ] Ladder modifier applies (stat → -2 to +7)
- [ ] Margin = total - DC calculated correctly
- [ ] Margin = 0 = tie
  - [ ] AI should add cost or complication
  - [ ] Choice details show `[Skill: tie (margin 0)]`
- [ ] Margin ≥ 3 = success with style
  - [ ] AI MUST add bonus effect
  - [ ] Choice details show `[Skill: success with style (+X)]`
- [ ] Regular success shows margin
  - [ ] Choice details show `[Skill: success (margin +X)]`
- [ ] Advantage: +1 per source
- [ ] Disadvantage: -1 per source

#### YZE System

- [ ] Base dice = stat ÷ 20 (0-5 dice)
- [ ] Each 6 = 1 success
- [ ] Success when successes ≥ DC
- [ ] Stress dice selection UI appears before roll
- [ ] Player can choose 0-5 stress dice (or up to 10-current stress)
- [ ] Stress dice also count 6s (increase success chance)
- [ ] Rolling 1 on ANY stress die triggers panic
  - [ ] Panic roll = 1d6 + current stress
  - [ ] Panic effect from table (1-6 = Shaken, 7-25+ = escalating)
  - [ ] Panic narrated by AI (even on success!)
  - [ ] Choice details show `[PANIC! Effect: Description]`
- [ ] Strong success (3+ over DC) reduces stress by 1
- [ ] Choice details show `[Skill: result (X successes vs Y)]`

#### Explosive Dice System

- [ ] Die size determined by stat:
  - [ ] 0-16 = d4
  - [ ] 17-33 = d6
  - [ ] 34-50 = d8
  - [ ] 51-66 = d10
  - [ ] 67-83 = d12
  - [ ] 84-100 = d20
- [ ] Rolling max (4 on d4, 20 on d20) causes explosion
- [ ] Explosion rolls again and adds to total
- [ ] Multiple explosions chain infinitely (rare!)
- [ ] Success when total ≥ DC (no modifiers)
- [ ] Advantage: Roll twice, keep higher
- [ ] Disadvantage: Roll twice, keep lower
- [ ] No stacking (only 1 extra roll)
- [ ] Choice details show explosion count:
  - [ ] `[Skill: success (d8 exploded x2)]`
  - [ ] `[Skill: failure (d12)]` (no explosions)

#### Percentile System

- [ ] Roll 1d100
- [ ] Success when roll ≤ stat (no DC!)
- [ ] Roll 1-5 = critical success
- [ ] Roll 96-100 = critical failure
- [ ] Advantage: Roll twice, keep lower
- [ ] Disadvantage: Roll twice, keep higher
- [ ] Resource penalty reduces effective stat, not roll

#### 1d100 System

- [ ] Roll 1d100 + stat ≥ DC
- [ ] Stat scaling 1:1 (no conversion)
- [ ] DCs in 30-140 range
- [ ] Standard advantage/disadvantage (roll twice)

---

### Item System

#### Item Types

- [ ] **Normal**:
  - [ ] Grants advantage when used
  - [ ] Breaks on failure (quantity - 1)
  - [ ] Removed when quantity reaches 0
- [ ] **Consumable**:
  - [ ] Grants advantage when used
  - [ ] Consumed immediately (before check)
  - [ ] Removed when quantity reaches 0
- [ ] **Story**:
  - [ ] Grants advantage when used
  - [ ] Never breaks or consumed (quest items)
- [ ] **Misc**:
  - [ ] Prevents disadvantage (no advantage granted)
  - [ ] Never breaks or consumed

#### Item Interactions

- [ ] Missing item = disadvantage
- [ ] Fuzzy matching works (AI says "lockpicks" → matches "Lockpicks")
- [ ] Match notification shows similarity %
- [ ] Item usage logged in choice details
  - [ ] `[ItemUsed: Lockpicks; x2]` (used, not broken)
  - [ ] `[ItemUsed: Rope; x1 → 0]` (consumed)
  - [ ] `[ItemUsed: Sword; x3 → broken]` (broke on failure)

---

### Resource System

- [ ] Required resource calculated: DC ÷ divisor (min 5)
- [ ] Insufficient resource applies dice penalty: -DC ÷ divisor
- [ ] Penalty shown in notification
- [ ] Success recovers resources: DC ÷ divisor (min 1)
- [ ] Failure loses resources: DC ÷ divisor (min 5)
- [ ] Resource changes logged in choice details:
  - [ ] `[Resource: Stamina 45 → 50/100]` (success recovery)
  - [ ] `[Resource: Health 30 → 20/50]` (failure loss)
- [ ] Systems with 0 divisor don't require resources (PbtA, Fate, YZE)

---

### Advantage/Disadvantage Stacking

#### Sources Tracked

- [ ] Items (normal/consumable/story)
- [ ] Achievements (`advOn`/`disadvOn` arrays)
- [ ] Momentum advantage
- [ ] Missing items
- [ ] Insufficient resources (system-dependent)
- [ ] Misc items (prevent disadvantage only)

#### Stacking Rules

- [ ] Net advantage = advantage count - disadvantage count
- [ ] Max ±5 (clamped)
- [ ] Sources displayed in notification
- [ ] 3d6: Extra dice added to pool
- [ ] 1d20/1d100/Percentile: Extra rolls
- [ ] PbtA/Fate: ±1 modifier per source
- [ ] YZE: Add/remove base dice
- [ ] Explosive: Only 1 extra roll (no stacking)

---

### AI Integration

#### Choice Details Format

- [ ] Skill checks include result: `[SkillName: result]`
- [ ] PbtA partial: `[Skill: partial success (7-9)]`
- [ ] Fate tie: `[Skill: tie (margin 0)]`
- [ ] Fate style: `[Skill: success with style (+X)]`
- [ ] Fate margin: `[Skill: success (margin +X)]`
- [ ] Explosive: `[Skill: result (dX exploded xY)]`
- [ ] YZE: `[Skill: result (X successes vs Y)]`
- [ ] YZE panic: Separate line `[PANIC! Effect]`

#### AI Response Parsing

- [ ] Extracts `<story>` content
- [ ] Extracts `<memory>` updates
- [ ] Parses `<choices>` list
- [ ] Parses `<commands>` list
- [ ] Fallback: Treats entire response as story if no tags
- [ ] Handles malformed XML gracefully
- [ ] Handles responses with/without tags

#### AI Behavior Validation

- [ ] PbtA partial (7-9): AI adds complication/cost
- [ ] Fate tie: AI narrates "yes, but..." outcome
- [ ] Fate style: AI includes bonus effect
- [ ] Explosive explosions: AI describes dramatically
- [ ] YZE panic: AI narrates panic effect (even on success)
- [ ] YZE high successes: AI shows confidence
- [ ] YZE low successes: AI shows tension

---

### Dice Visualizer Component

#### Animation Phases

- [ ] Phase 1: Rolling (dice tumbling)
- [ ] Phase 2: Stopped (show final values)
- [ ] Phase 3: Calculating (fade out non-kept dice)
- [ ] Phase 4: Result (show success/failure with 5s hold)
- [ ] Total duration: ~9 seconds
- [ ] Skip controls work:
  - [ ] Click anywhere
  - [ ] Press Enter
  - [ ] Press Space
  - [ ] Press Escape

#### System-Specific Display

- [ ] 3d6: Shows all dice in pool, highlights kept 3
- [ ] 1d20: Shows single die + modifier
- [ ] PbtA: Shows 2d6 + modifier, highlights partial range (7-9)
- [ ] Fate: Shows 4 fudge dice (-1/0/+1) + ladder
- [ ] YZE: Shows base dice (white) and stress dice (yellow)
  - [ ] Stress dice highlighted if 1 rolled (panic)
  - [ ] Success count displayed
- [ ] Explosive: Shows explosion chain visually
  - [ ] Each explosion animates separately
  - [ ] Total accumulated

#### Visual Feedback

- [ ] Success: Green highlight
- [ ] Failure: Red highlight
- [ ] Partial: Yellow/orange highlight (PbtA)
- [ ] Tie: Blue highlight (Fate)
- [ ] Style: Gold highlight (Fate)
- [ ] Advantage: Shows all rolls, highlights kept
- [ ] Disadvantage: Shows all rolls, highlights kept (worst)
- [ ] Critical: Special sparkle effect

---

### Command Processing

Test each command type:

- [ ] `/modify_stat: StatName +10` (increases stat)
- [ ] `/modify_stat: StatName -5` (decreases stat)
- [ ] `/modify_resource: ResourceName +20` (increases resource)
- [ ] `/modify_resource: ResourceName -10` (decreases resource)
- [ ] `/add_item: Item Name | Description | normal | 3` (adds item)
- [ ] `/consume_item: Item Name` (removes 1 quantity)
- [ ] `/break_item: Item Name` (removes 1 quantity, same as consume)
- [ ] `/unlock_achievement: Achievement Name` (marks completed)
- [ ] `/deal_damage: 15` (reduces HP/health resource)
- [ ] `/toggle_lore: Lore Title` (toggles `on` state)
- [ ] `/advance_beat: 2` (marks beat as fulfilled)

#### Fuzzy Matching

- [ ] Commands fuzzy match entity names (70% threshold)
- [ ] Notifications show matched name and similarity %
- [ ] Logs matched results for debugging

---

### Momentum System

- [ ] Momentum UI shows current/max
- [ ] Reroll mode costs 1 momentum
  - [ ] Grants advantage on roll
  - [ ] Notification confirms spend
- [ ] Guarantee mode costs 2 momentum
  - [ ] Auto-succeeds check
  - [ ] No roll performed
  - [ ] Notification confirms spend
- [ ] Momentum persists across scenes
- [ ] Momentum cap at maxMomentum (default 5)

---

### Custom Input

- [ ] Free-form text submission works
- [ ] Bypasses validation (no predefined choice)
- [ ] AI interprets intent
- [ ] AI may inject skill checks in response
- [ ] Text prepended with ">" in scene history

---

### Edge Cases

#### Empty States

- [ ] No inventory: Missing item = disadvantage
- [ ] No resources: Insufficient resource penalty applies
- [ ] Zero stats: Rolls with 0 modifier
- [ ] No achievements: No advantage/disadvantage from achievements

#### Boundary Values

- [ ] Stat 0: Minimum modifier
- [ ] Stat 100+: Maximum modifier (capped per system)
- [ ] DC 0: Trivial (auto-success in some systems)
- [ ] DC 999: Impossible (requires max rolls + high stats)
- [ ] Advantage/disadvantage ±10: Capped at ±5

#### Race Conditions

- [ ] Rapid choice selection doesn't break state
- [ ] Dice animation completes before next choice
- [ ] Skip animation doesn't break subsequent rolls
- [ ] Multiple notifications don't overlap

#### Payload Size

- [ ] Story with 100+ parts trims correctly (<4.5MB)
- [ ] Large descriptions don't break generation
- [ ] Many items/stats/resources handled
- [ ] Deep choice history doesn't overflow

---

## Debugging Tools

### Logger (`app/misc/logger.ts`)

```typescript
import { logger } from "../misc/logger";

logger.action("User selected choice", { choice, index });
logger.ai_request("Sending to AI", { model, payload });
logger.ai_response("Received from AI", { content });
logger.info("Fuzzy matched", { provided, matched, score });
logger.error("Failed to parse", { error });
```

**Browser Console**: `localStorage.setItem('debug', 'true')` to enable verbose logging

### React DevTools

- Inspect StoryData state in app/story/page.tsx
- Check StoryState enum (STORY/STATS/INVENTORY/etc)
- Verify scene.parts array
- Check choices state

### Network Tab

- Monitor `/api/story/next` requests
- Check payload size (should be <4.5MB)
- Verify model routing (DeepSeek vs OpenRouter)
- Check token deduction in response meta

### Vitest UI

```bash
npm run test -- --ui
```

Opens interactive test runner in browser.

---

## Regression Testing

When making changes, verify:

1. **RPG System Changes**: Run all rpgSystems.\*.test.ts
2. **AI Changes**: Run ai.\*.test.ts
3. **Command Changes**: Run story.processCommands.test.ts
4. **UI Changes**: Manual test dice visualizer + choice flow
5. **Build**: `npm run build` succeeds
6. **Lint**: `npm run lint` passes

---

## Performance Testing

### Payload Size Testing

```typescript
// In browser console after loading story
const payload = JSON.stringify(storyData);
console.log(`Payload: ${(payload.length / 1024).toFixed(2)} KB`);
// Should be < 4500 KB (4.5MB)
```

### Dice Animation Performance

- [ ] Animation smooth at 60fps
- [ ] No jank during dice rolling phase
- [ ] Memory doesn't leak after many rolls
- [ ] Skip transition instant (< 50ms)

### Large Story Performance

- [ ] 100+ scene parts load quickly
- [ ] Choice selection responsive
- [ ] State updates don't block UI
- [ ] Memory usage stable over long sessions

---

## Test Coverage Goals

- **RPG Systems**: 90%+ (core mechanics are critical)
- **AI Parsing**: 85%+ (many edge cases)
- **Commands**: 80%+ (fuzzy matching has variability)
- **Components**: 60%+ (UI components harder to test)

**Current Coverage**: Run `npm run test -- --coverage` to see latest.

---

## Bug Reporting Template

When filing bugs, include:

```
**System**: [3d6 / 1d20 / PbtA / Fate / YZE / Explosive / etc]
**Expected**: [What should happen]
**Actual**: [What actually happened]
**Steps to Reproduce**:
1. Load story with X system
2. Select choice with DC Y
3. Observe Z

**Context**:
- Stat value: X
- DC: Y
- Items used: Z
- Advantage/Disadvantage: A/D
- Roll result: R
- Choice details sent to AI: [...]

**Logs**: [Console logs, if any]
**Screenshots**: [If applicable]
```

---

## Automated Testing (Future)

Potential areas for E2E testing:

- [ ] Playwright/Cypress tests for full story flow
- [ ] API endpoint testing (token deduction, auth)
- [ ] Visual regression testing (dice animations)
- [ ] Load testing (many concurrent users)
- [ ] Database migration testing (Supabase RLS)

---

## Summary

Testing priorities:

1. **Critical**: RPG system mechanics (unit tests)
2. **High**: AI integration (unit + manual)
3. **Medium**: UI components (manual)
4. **Low**: Edge cases (manual spot checks)

Run unit tests before every commit. Manual test checklist before releases.
