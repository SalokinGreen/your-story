# Momentum System Database Migration

## Overview

The momentum system adds two new fields to the `StoryData` interface:
- `momentum: number` - Current momentum (default: 3)
- `maxMomentum: number` - Maximum momentum (default: 5)

## Why No Schema Changes?

The database stores story data as **JSONB** in both:
- `stories.story_data` - Player story progress
- `adventures.story_template` - Adventure starting templates

JSONB is schema-less, so adding new fields to the TypeScript interface automatically works. However, **existing records** in the database won't have these fields until we migrate them.

## Migration Steps

### For Fresh Installations
✅ **No action needed!** New stories will automatically include momentum fields from the TypeScript interface.

### For Existing Databases

Run the migration script to add momentum to existing data:

1. Open Supabase SQL Editor
2. Copy contents of `docs/momentum-migration.sql`
3. Execute the script
4. Verify with the provided SELECT queries

## What the Migration Does

```sql
-- Adds momentum = 3 and maxMomentum = 5 to:
-- 1. All existing player stories (stories table)
-- 2. All adventure templates (adventures table)

-- Only updates records missing momentum fields (idempotent)
```

## Verification

After migration, check a story:

```sql
SELECT 
    id,
    story_name,
    story_data->>'momentum' as momentum,
    story_data->>'maxMomentum' as max_momentum
FROM public.stories
WHERE user_id = 'your-user-id'
LIMIT 5;
```

Expected result:
- `momentum`: `"3"`
- `max_momentum`: `"5"`

## Default Values

The migration uses these defaults:
- **Starting momentum**: 3/5 (60% full)
- **Max momentum**: 5 (can be earned up to this cap)

These match the values in `starter_stories.ts` for consistency.

## Rollback (if needed)

To remove momentum fields from existing records:

```sql
-- Remove from stories
UPDATE public.stories
SET story_data = story_data - 'momentum' - 'maxMomentum';

-- Remove from adventures
UPDATE public.adventures
SET story_template = story_template - 'momentum' - 'maxMomentum';
```

## Testing Checklist

- [ ] Run migration script in Supabase SQL Editor
- [ ] Verify momentum fields appear in existing stories
- [ ] Create a new story - should have momentum automatically
- [ ] Load an existing story - should show momentum UI
- [ ] Spend momentum in-game - should persist on save
- [ ] Check stats page - momentum display should show correctly

## Notes

- The migration is **idempotent** - safe to run multiple times
- Doesn't affect new stories created after code deployment
- TypeScript interface ensures type safety for new records
- JSONB automatically handles the new fields without schema changes
