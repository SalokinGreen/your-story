# Dice Roll Visualization

> **Note**: This document describes legacy dice visualization. See [rpg-systems.md](rpg-systems.md) for comprehensive RPG system documentation and [choice-system.md](choice-system.md) for choice flow details.

Baldur's Gate 3-inspired dice roll animation that displays during skill checks to build player trust and immersion.

## Current Implementation

**Active Component**: [`app/components/DiceVisualizer.tsx`](../app/components/DiceVisualizer.tsx)

The current dice visualizer supports **all 8 RPG systems** with a 4-phase animation:

1. **Rolling** (1.8s): Dice tumbling
2. **Stopped** (0.8s): Show final values
3. **Calculating** (1.2s): Fade non-kept dice
4. **Result** (5s): Display success/failure

**Key Features**:

- System-specific visuals (PbtA partial success, Fate ladder, YZE stress/panic, Explosive explosions)
- Click or keyboard (Enter/Space/Escape) to skip
- Advantage/disadvantage stacking with source tracking
- Real-time calculation display

See [rpg-systems.md](rpg-systems.md) for detailed mechanics of each system.

---

## Legacy Documentation

### DiceRollVisualization

**Status**: ⚠️ **DEPRECATED** - Component file does not exist. Documentation preserved for reference only.

A full-screen overlay component that animates dice rolls with BG3-style presentation.

**Features**:

- Animated dice icon with spinning animation during rolling
- Sequential display of multiple rolls (advantage/disadvantage/reroll)
- Visual highlighting of final selected roll
- Complete skill check calculation display
- Success/failure outcome badges
- Critical success sparkle effects
- Momentum/item/resource usage indicators

### DiceRollData Interface

```typescript
interface DiceRollData {
  type: "advantage" | "disadvantage" | "normal" | "reroll";
  rolls: number[]; // All rolls performed
  finalRoll: number; // The selected roll used
  statName: string; // Skill being checked
  statValue: number; // Player's skill value
  dc: number; // Difficulty Class
  total: number; // Final total (roll + stat - penalty)
  success: boolean; // Check result
  critical?: boolean; // True if roll was 100
  penalty?: number; // Dice penalty from insufficient resources
  itemUsed?: string; // Item used for advantage
  resourceUsed?: string; // Resource consumed
  momentumUsed?: "reroll" | "guarantee"; // Momentum ability used
}
```

## Animation Flow

1. **Rolling Phase** (1.2 seconds)

   - Dice icon spins continuously
   - Random numbers cycle rapidly (every 50ms)
   - Creates anticipation and excitement

2. **Roll Result** (0.6 seconds per roll)

   - Shows actual roll number
   - Displays roll type badge (advantage/disadvantage/reroll)
   - For multiple rolls, plays sequentially
   - Crossed out rolls indicate non-selected options

3. **Calculation Display** (2 seconds)

   - Shows complete math: `Roll + Stat = Total vs DC`
   - Highlights penalties in red if present
   - Color-codes result (green success, red failure, purple critical)

4. **Result Badge** (1.5 seconds)

   - Large success/failure/critical badge
   - Icon indicator (check/X/sparkles)
   - Item and resource usage details

5. **Complete** (auto-dismiss)
   - Total display time: ~5-6 seconds per check
   - Automatically clears and continues story

## Integration Points

### Story Page

**Location**: `app/story/page.tsx`

The dice visualization is triggered during `handleChoice()` when:

- A skill check is performed (`choice.skill_used`)
- Momentum guarantee is used
- Any roll occurs (normal, advantage, disadvantage, reroll)

**State Management**:

```typescript
const [diceRollData, setDiceRollData] = useState<DiceRollData | null>(null);
const [showDiceRoll, setShowDiceRoll] = useState(false);
```

**Tracking Rolls**:

```typescript
let allRolls: number[] = [dice_roll]; // Initial roll
let rollType: "advantage" | "disadvantage" | "normal" | "reroll" = "normal";

// Add subsequent rolls for advantage/disadvantage
allRolls.push(second_roll);
rollType = "advantage";
```

**Display Trigger**:

```typescript
setDiceRollData({
  type: rollType,
  rolls: allRolls,
  finalRoll: dice_roll,
  statName: choice.skill_used,
  statValue,
  dc,
  total,
  success: dc_passed,
  critical: dice_roll === 100,
  penalty: dicePenalty > 0 ? dicePenalty : undefined,
  itemUsed: choice.item_used,
  resourceUsed: choice.resource_used,
  momentumUsed: momentumMode === "reroll" ? "reroll" : undefined,
});
setShowDiceRoll(true);

// Wait for animation to complete
await new Promise((resolve) => {
  const checkInterval = setInterval(() => {
    if (!showDiceRoll) {
      clearInterval(checkInterval);
      resolve(true);
    }
  }, 100);
});
```

## Visual States

### Roll Types

**Normal Roll** (Blue badge)

- Single d100 roll
- No modifiers
- Standard skill check

**Advantage** (Green badge with Package icon)

- Two rolls displayed
- Lower roll selected (crossed out higher)
- Item used indicator

**Disadvantage** (Red badge with Package icon)

- Two rolls displayed
- Higher roll selected (crossed out lower)
- Missing item indicator

**Momentum Advantage** (Yellow badge with Zap icon)

- Shows original roll + 2 advantage rolls
- Best of 3 selected
- Momentum cost displayed

**Guaranteed Success** (Purple badge with Zap icon)

- Shows roll but auto-succeeds
- 3 momentum cost displayed
- Success badge always shown

### Result Colors

**Success** - Green

- Check mark icon
- Green border and glow
- Positive outcome text

**Failure** - Red

- X icon
- Red border and glow
- Negative outcome text

**Critical Success** (Roll 100) - Purple

- Sparkles icon + effect
- Purple border and glow
- Animated sparkles around dice
- "Critical Success!" text

## Styling

The component uses inline `<style jsx>` for animations:

```css
@keyframes fade-in {
  from {
    opacity: 0;
  }
  to {
    opacity: 1;
  }
}

@keyframes scale-in {
  from {
    transform: scale(0.8);
    opacity: 0;
  }
  to {
    transform: scale(1);
    opacity: 1;
  }
}

@keyframes spin-slow {
  from {
    transform: rotate(0deg);
  }
  to {
    transform: rotate(360deg);
  }
}
```

**Color Scheme**:

- Background: `bg-black/80 backdrop-blur-sm` (overlay)
- Card: `bg-gradient-to-b from-gray-800 to-gray-900`
- Borders: `border-2 border-gray-700`
- Success: `text-green-400/500`, `border-green-500`
- Failure: `text-red-400/500`, `border-red-500`
- Critical: `text-purple-400/500`, `border-purple-500`

## Player Experience

### Trust Building

- Shows actual random numbers being generated
- Displays complete calculation (transparent math)
- Highlights all modifiers (items, stats, penalties)
- Makes momentum usage visible
- Confirms resource consumption

### Immersion

- Cinematic full-screen presentation
- Smooth animations and transitions
- BG3-style aesthetic (dark theme, dramatic)
- Sound-ready design (can add audio later)

### Information Clarity

- All rolls displayed with context
- Selected roll clearly marked
- Full math breakdown shown
- Result unambiguous

## Future Enhancements

1. **Sound Effects**

   - Dice rolling sound during animation
   - Success/failure chimes
   - Critical success fanfare

2. **Particle Effects**

   - More elaborate sparkles for critical
   - Dust particles during roll
   - Success/failure burst effects

3. **Customization**

   - Toggle visualization on/off
   - Speed settings (fast/normal/slow)
   - Accessibility mode (instant display)

4. **Additional Roll Types**

   - Advantage+Reroll visualization
   - Disadvantage+Reroll visualization
   - Multiple simultaneous checks

5. **Mobile Optimization**
   - Touch-friendly dismiss button
   - Reduced animation complexity option
   - Portrait mode layout adjustments

## Performance

- Uses `crypto.getRandomValues()` for secure RNG
- Minimal re-renders during animation
- Self-cleaning (auto-dismisses)
- No persistent state pollution
- Optimized animation timing

## Testing

To test the dice visualization:

1. Start a story with skill checks
2. Make a choice that requires a skill check
3. Observe the dice animation sequence
4. Verify calculations match expected values
5. Test with advantage (use item)
6. Test with disadvantage (missing item)
7. Test with momentum advantage
8. Test with momentum guarantee
9. Test critical success (roll 100)
10. Test with resource penalties

## Accessibility

**Current**:

- High contrast colors
- Large text and icons
- Clear visual hierarchy
- Auto-dismiss (no interaction required)

**Planned**:

- Screen reader announcements
- Skip animation option
- Reduced motion support
- Keyboard navigation
