# Points System Migration

## Overview

This migration adds the points progression system to existing stories and adventures in the database. The points system allows players to earn upgrade points from completing chapters and unlocking achievements, which can be spent in the Upgrades shop to improve their character.

## What Gets Added

The migration adds two new fields to the `storyData` JSONB column:

- `points` (number): Current point balance (starts at 0)
- `earnedPointsFromChapters` (number[]): Array tracking which chapter indices have already awarded points

## Point Earning System

- **Chapters**: 50 points per chapter when `!!! END CHAPTER !!!` marker appears
- **Achievements**: Variable points based on achievement.points field

## Point Spending

Players can spend points in the Upgrades shop:
- **Stat Increase**: 10 points to increase any stat by 1 (max 100)
- **Resource Max Increase**: 15 points to increase any resource maximum by 10
- **Add Item**: 20 points to add a custom item to inventory

## How to Run

1. Open your Supabase Dashboard
2. Navigate to SQL Editor
3. Copy the contents of `points-migration.sql`
4. Paste and run the SQL script

## Verification

After running the migration, the script will output a count of:
- Stories with points fields
- Adventures with points fields

These counts should match your total story/adventure counts.

## Idempotency

This migration is **safe to run multiple times**. It uses `WHERE` clauses to only update rows that don't already have the points fields, preventing duplicate updates.

## Rollback

If you need to remove the points system (not recommended):

```sql
-- Remove points fields from stories
UPDATE stories
SET storyData = storyData - 'points' - 'earnedPointsFromChapters';

-- Remove points fields from adventures
UPDATE adventures
SET storyData = storyData - 'points' - 'earnedPointsFromChapters';
```

## Integration with TypeScript

The TypeScript interface has already been updated in `app/misc/structs.ts`:

```typescript
export interface StoryData {
  // ... existing fields ...
  points: number;
  earnedPointsFromChapters: number[];
}

export const UPGRADE_COSTS = {
    STAT_INCREASE: 10,
    RESOURCE_MAX_INCREASE: 15,
    ADD_ITEM: 20,
    CHAPTER_REWARD: 50,
} as const;
```

## New Features Added

1. **Upgrades Tab**: New navigation button and page for spending points
2. **Point Earning Logic**: Automatic point awards after AI response for chapters
3. **Point Display**: Prominent display in Stats page showing current balance and earning rates
4. **AI Awareness**: AI can use achievement triggers to grant progression rewards

## Testing

After migration, test the full flow:

1. Load an existing story
2. Progress until `!!! END CHAPTER !!!` appears
3. Verify 50 points are awarded
4. Navigate to Upgrades tab
5. Purchase a stat upgrade for 10 points
6. Verify stat increases and points deduct
7. Check Stats page to see updated point balance

## Related Files

- `app/story/page.tsx` - Main story logic with handlePurchase and point earning
- `app/story/upgrades.tsx` - Upgrade shop component
- `app/story/stats.tsx` - Points display in character sheet
- `app/misc/ai.ts` - AI prompt includes points documentation
- `app/misc/structs.ts` - StoryData interface and UPGRADE_COSTS constants
- `docs/points-migration.sql` - This migration script
