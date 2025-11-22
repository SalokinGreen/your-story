# RPG Systems Documentation

This document describes the 8 RPG systems supported by Your Story and how they integrate with the AI narrative engine.

## Overview

Each RPG system provides different dice mechanics, success thresholds, and narrative outcomes. The system choice fundamentally changes how skill checks work and how the AI interprets results.

**Location**: [`app/misc/rpgSystems.ts`](../app/misc/rpgSystems.ts)

**Key Functions**:
- `getRPGSystem(systemId)`: Get system configuration
- `rollDice(system, dieSides?)`: Roll dice according to system rules
- `checkSuccess(system, roll, stat, dc, penalty, rolls?)`: Determine success/failure with system-specific outcomes
- `calculateResourceRequirements(system, dc)`: Calculate resource costs based on DC

---

## System Reference

### 1. 3d6 (Bell Curve)

**Dice**: Roll 3 six-sided dice (3-18)  
**Distribution**: Bell curve - most rolls near 10-11, extremes rare  
**Formula**: `3d6 + Stat ≥ DC`

**Stat Scaling**: 0-100 stat → 0-18 modifier (stat × 0.18)

**DC Guidelines**:
- DC 8: Trivial
- DC 15: Easy
- DC 20: Medium (default for normal challenges)
- DC 25: Hard
- DC 30: Very Hard
- DC 35+: Impossible (requires max roll + high stat)

**AI Context**: Standard `[SkillName: success]` or `[SkillName: failure]`

**Use Case**: Balanced, predictable gameplay with less variance than d20.

---

### 2. 1d20 (D&D Style)

**Dice**: Roll 1 twenty-sided die (1-20)  
**Distribution**: Flat - every number equally likely (5% each)  
**Formula**: `1d20 + Stat ≥ DC`

**Stat Scaling**: 0-100 stat → 0-20 modifier (stat × 0.2)

**DC Guidelines**:
- DC 5: Trivial
- DC 10: Easy
- DC 15: Medium (default for normal challenges)
- DC 20: Hard
- DC 25: Very Hard
- DC 30+: Impossible

**AI Context**: Standard `[SkillName: success]` or `[SkillName: failure]`

**Use Case**: High variance, dramatic swings. Natural 1s and 20s create memorable moments.

---

### 3. 1d100 (Percentile)

**Dice**: Roll 1 hundred-sided die (1-100)  
**Distribution**: Flat - maximum granularity (1% per number)  
**Formula**: `1d100 + Stat ≥ DC`

**Stat Scaling**: 0-100 stat → 0-100 modifier (1:1, no conversion)

**DC Guidelines**:
- DC 30: Trivial
- DC 60: Easy
- DC 80: Medium (default)
- DC 100: Hard
- DC 120: Very Hard
- DC 140+: Impossible

**AI Context**: Standard `[SkillName: success]` or `[SkillName: failure]`

**Use Case**: Precise difficulty tuning with percentage-based probability.

---

### 4. Percentile (Roll-Under)

**Dice**: Roll 1d100, try to roll ≤ stat value  
**Distribution**: Flat  
**Formula**: `1d100 ≤ Stat` (no DC!)

**Stat Scaling**: 0-100 stat = direct success probability (70 stat = 70% chance)

**DC Guidelines**: N/A - system doesn't use DCs! Challenge comes from stat values.

**AI Context**: Standard `[SkillName: success]` or `[SkillName: failure]`

**Special Notes**:
- Roll 1-5: Critical success
- Roll 96-100: Critical failure
- AI should NEVER set DC values for this system
- Difficulty adjusted via stat modifiers, not DCs

**Use Case**: Classic percentile gameplay where skills directly represent success chance.

---

### 5. PbtA (Powered by the Apocalypse)

**Dice**: Roll 2d6 + modifier (2-12)  
**Distribution**: Bell curve  
**Formula**: `2d6 + Modifier` (no DC comparison!)

**Stat Scaling**: 0-100 stat → -2 to +3 modifier
- 0-20: -2
- 21-40: -1
- 41-60: 0
- 61-80: +1
- 81-100: +2
- 100+: +3

**Fixed Thresholds** (DO NOT VARY):
- **10+**: Full Success - achieve goal cleanly
- **7-9**: Partial Success - succeed with complication/cost/hard choice
- **6-**: Failure - fail with consequences

**AI Context Examples**:
- `[Charm: success]` (rolled 10+)
- `[Stealth: partial success (7-9)]` (rolled 7-9)
- `[Combat: failure]` (rolled 6-)

**AI Behavior**:
- **On 10+**: Clean success, no complications
- **On 7-9**: MUST add one of:
  - Success with cost (lose resource, take damage)
  - Success with complication (alert enemies, time pressure)
  - Hard choice (save ally OR complete objective)
  - Lesser effect (succeed but imperfectly)
- **On 6-**: Failure AND make hard move (danger, damage, reveal unwelcome truth)

**Special Notes**:
- AI should NEVER vary the 7/10 thresholds
- Difficulty comes from consequences, not DC changes
- Momentum can add +1 to roll

**Use Case**: Narrative-focused gameplay where partial successes drive story tension.

---

### 6. Fate Core

**Dice**: Roll 4 Fudge dice (4dF), each showing -1/0/+1  
**Distribution**: Bell curve around 0  
**Formula**: `4dF + Ladder Modifier`

**Stat Scaling**: 0-100 stat → -2 to +7 ladder modifier
- 0-10: -2 (Terrible)
- 11-20: -1 (Poor)
- 21-30: 0 (Mediocre)
- 31-40: +1 (Average)
- 41-50: +2 (Fair)
- 51-60: +3 (Good)
- 61-70: +4 (Great)
- 71-80: +5 (Superb)
- 81-90: +6 (Fantastic)
- 91-100: +7 (Epic)

**DC Guidelines** (Opposition Ladder):
- DC 0: Mediocre
- DC 2: Fair (typical difficulty)
- DC 4: Great (challenging)
- DC 6: Fantastic (extraordinary)
- DC 8+: Legendary

**Four Outcomes** (based on margin = total - DC):
- **Margin < 0**: Fail
- **Margin = 0**: Tie (succeed at cost)
- **Margin 1-2**: Success
- **Margin ≥ 3**: Success with Style (bonus effect)

**AI Context Examples**:
- `[Athletics: success (margin +2)]`
- `[Diplomacy: tie (margin 0)]`
- `[Combat: success with style (+5)]`
- `[Stealth: failure]`

**AI Behavior**:
- **Tie**: Success at cost or partial success
- **Success with Style**: MUST include bonus:
  - Extra effect beyond intent
  - Automatic advantage for next action
  - Reduce incoming harm
  - Discover useful information

**Special Notes**:
- Use Fate ladder names in narration ("That's a Great result!")
- Aspects (items) can be invoked for +2 (costs 1 Fate Point resource)
- Stress/Consequences replace traditional HP

**Use Case**: Cinematic gameplay with dramatic outcomes and aspect-driven narrative.

---

### 7. YZE (Year Zero Engine)

**Dice**: Pool of d6s (stat ÷ 20 = base dice), count 6s as successes  
**Distribution**: Each die: 16.67% success chance  
**Formula**: Count 6s in pool ≥ DC (DC = required successes)

**Stat Scaling**: 0-100 stat → 0-5 base dice (stat ÷ 20)
- Stat 0-19: 0 base dice
- Stat 20-39: 1 base die
- Stat 40-59: 2 base dice
- Stat 60-79: 3 base dice
- Stat 80-99: 4 base dice
- Stat 100+: 5 base dice

**DC Guidelines** (Success Count Required):
- DC 1: Simple task (most common)
- DC 2: Moderate challenge
- DC 3: Difficult task
- DC 4+: Extremely challenging

**Stress Dice Mechanic**:
- Player can add 0-5 stress dice BEFORE rolling
- Each stress die: +1 stress to character (max 10 stress)
- Stress dice also count 6s (more success chance)
- **BUT**: Rolling 1 on ANY stress die triggers PANIC

**Panic System** (when stress die shows 1):
1. Roll 1d6 + current stress level
2. Consult panic table (1-6 = Shaken, 7-25+ = escalating effects)
3. Apply panic effect immediately (even if skill check succeeded!)

**AI Context Examples**:
- `[Mechanics: success (3 successes vs 2)]`
- `[Combat: failure (1 successes vs 2)]`
- `[PANIC! Freeze: You can't take actions for one round]` (separate line)

**AI Behavior**:
- **Strong Success** (3+ successes beyond DC): -1 stress relief
- **Panic Triggered**: Narrate panic effect dramatically (even on success)
- Describe stress building (sweating, shaking, fear)

**Push Mechanic**: After failure, reroll non-6s for +1 stress and risk item breaking.

**Special Notes**:
- More stress = worse panic effects (stress is tracked 0-10)
- Panic creates drama: successful shot followed by dropping weapon
- Base dice = competency, stress dice = desperation

**Use Case**: Survival horror with escalating tension and panic mechanics.

---

### 8. Explosive Dice

**Dice**: Single die (size based on stat), reroll on max  
**Distribution**: Flat per die, but with explosion chains  
**Formula**: Roll dX ≥ DC (where X = die size)

**Stat to Die Size**:
- Stat 0-16: d4 (weak)
- Stat 17-33: d6 (below average)
- Stat 34-50: d8 (average)
- Stat 51-66: d10 (good)
- Stat 67-83: d12 (great)
- Stat 84-100: d20 (exceptional)

**Explosion Mechanic**:
- When die shows max (4 on d4, 20 on d20), roll again and ADD
- Explosions chain infinitely (rare but possible)
- Example: d10 rolls 10 → roll again: 7 = 17 total

**DC Guidelines**:
- DC 4: Trivial (d4 auto-succeeds)
- DC 8: Easy (d6+ can hit easily)
- DC 12: Medium (default)
- DC 16: Hard (needs d12+ or explosion)
- DC 20: Very Hard (needs d20 or multiple explosions)
- DC 25+: Requires explosive luck

**AI Context Examples**:
- `[Acrobatics: success (d8 exploded x2)]` (rolled d8: 8, 8, 3 = 19)
- `[Stealth: failure (d12)]` (rolled d12: 7, no explosions)
- `[Combat: success (d20)]`

**AI Behavior**:
- **Multiple Explosions**: Describe as heroic, lucky, or dramatic moment
- **No Explosions**: Show character competency level (d4 vs d20)
- Explosions are RARE (10% for d10, 5% for d20) - treat as special

**Special Notes**:
- Pure luck-based system
- Even d4 can beat d20 through explosions (creates underdog victories)
- No modifiers - stat determines die size only
- Character progression = bigger dice

**Use Case**: Dramatic, luck-based gameplay where anyone can have a heroic moment.

---

## Advantage & Disadvantage

All systems support advantage/disadvantage mechanics:

### Standard Systems (1d20, 1d100, Percentile)
- **Advantage**: Roll twice, take higher
- **Disadvantage**: Roll twice, take lower
- **Stacking**: Multiple sources add extra rolls (max ±5 rolls)

### 3d6 System
- **Advantage**: Roll 3 + advantage count dice, keep highest 3
- **Disadvantage**: Roll 3 + disadvantage count dice, keep lowest 3
- **Stacking**: Add extra dice per source (max ±5 extra dice)

### PbtA / Fate
- **Advantage**: +1 per source (stacking)
- **Disadvantage**: -1 per source (stacking)
- **Max**: ±5 modifier total

### YZE
- **Advantage**: Roll additional base dice
- **Disadvantage**: Remove base dice
- **Stacking**: Add/remove dice per source

### Explosive
- **Advantage**: Roll two dice, keep higher
- **Disadvantage**: Roll two dice, keep lower
- **No Stacking**: Only 1 extra roll regardless of sources

---

## Resource System Integration

All systems use DC-based resource calculations:

```
Required Resource = DC ÷ divisor (min 5)
Insufficient Penalty = -DC ÷ divisor to roll
Success Recovery = DC ÷ divisor
Failure Loss = DC ÷ divisor
```

**Divisors by System**:
- 3d6: 2 (DC 20 requires 10 resource)
- 1d20: 3 (DC 15 requires 5 resource)
- 1d100: 10 (DC 100 requires 10 resource)
- Percentile: 20 (stat 100 requires 5 resource)
- PbtA: 0 (no auto-requirements, -1 penalty if missing)
- Fate: 0 (aspect-driven resource use)
- YZE: 0 (no auto-requirements)
- Explosive: 3 (DC 12 requires 4 resource)

---

## AI Integration

### Choice Details Format

When a skill check occurs, the system constructs choice details sent to the AI:

**Format**: `[SkillName: result (context)]`

**Examples**:
```
[Lockpicking: success]
[Stealth: failure]
[Technique: partial success (7-9)]
[Diplomacy: tie (margin 0)]
[Combat: success with style (+5)]
[Athletics: success (margin +2)]
[Acrobatics: success (d8 exploded x2)]
[Mechanics: success (3 successes vs 2)]
[Survival: failure (d4)]
```

### AI Response Guidelines

The AI uses these details to calibrate narrative:

1. **PbtA Partial Success (7-9)**: MUST add complication, cost, or hard choice
2. **Fate Tie**: Succeed at cost or introduce complication
3. **Fate Success with Style (+3+)**: Include bonus effect or advantage
4. **Explosive Explosions**: Describe moment dramatically (luck, heroism)
5. **YZE High Success Count**: Confident, capable outcome
6. **YZE Low Success Count**: Barely scraped by, tension remains
7. **Die Size (Explosive)**: Reflects character competency (d4 = weak, d20 = expert)

---

## Testing

### Manual Test Checklist

- [ ] 3d6: Advantage pools correctly (5d6 keep highest 3)
- [ ] 1d20: Natural 1/20 criticals work
- [ ] 1d100: Rolls scale correctly with stats
- [ ] Percentile: Roll-under succeeds at/below stat
- [ ] PbtA: Partial success (7-9) detected and sent to AI
- [ ] Fate: Tie and style detected, margin calculated
- [ ] YZE: Success counting works, stress dice trigger panic on 1s
- [ ] Explosive: Explosions chain, die size determined by stat
- [ ] All: Advantage/disadvantage sources tracked
- [ ] All: Resource penalties apply correctly

### Unit Tests

See `tests/rpgSystems.*.test.ts` for:
- Core dice rolling mechanics
- Success checking logic
- Advantage/disadvantage stacking
- YZE stress/panic calculations
- Explosive explosion chains

---

## Design Philosophy

Each system serves a different play style:

- **3d6**: Predictable, strategic gameplay
- **1d20**: Classic D&D, high variance drama
- **1d100/Percentile**: Granular control, skill-based
- **PbtA**: Narrative-first, complication-driven
- **Fate**: Cinematic, aspect-driven storytelling
- **YZE**: Horror, tension, stress management
- **Explosive**: Luck-based, underdog victories

The AI adapts its storytelling to match each system's mechanical feel.
