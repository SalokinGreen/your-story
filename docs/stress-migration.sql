-- Migration: Add Stress System to Existing Stories
-- Run this in your Supabase SQL Editor after the YZE stress system is deployed
-- This adds stress field to all existing story_data JSONB for Year Zero Engine compatibility

-- ============================================
-- ADD STRESS TO EXISTING STORIES
-- ============================================

-- Update all existing stories to add stress field
-- Sets default value: stress = 0 (no stress initially)
UPDATE public.stories
SET story_data = jsonb_set(
    story_data,
    '{stress}',
    '0',
    true
)
WHERE story_data->>'stress' IS NULL;

-- Verify the update
SELECT 
    id,
    story_name,
    story_data->>'stress' as stress,
    story_data->>'rpgSystem' as rpg_system,
    updated_at
FROM public.stories
LIMIT 10;

-- ============================================
-- ADD STRESS TO EXISTING ADVENTURE TEMPLATES
-- ============================================

-- Update all existing adventure templates to add stress field
-- This ensures new stories created from these adventures start with stress tracking
UPDATE public.adventures
SET story_template = jsonb_set(
    story_template,
    '{stress}',
    '0',
    true
)
WHERE story_template->>'stress' IS NULL;

-- Verify the adventure template update
SELECT 
    id,
    title,
    story_template->>'stress' as stress,
    story_template->>'rpgSystem' as rpg_system,
    updated_at
FROM public.adventures
LIMIT 10;

-- ============================================
-- NOTES
-- ============================================

/*
This migration:
1. Adds stress (default: 0) to all existing stories
2. Updates adventure templates so new stories start with stress tracking
3. Uses jsonb_set with 'create_if_missing=true' to safely add new field
4. Only updates records that don't already have stress field (idempotent)

The stress field is used by the Year Zero Engine (YZE) RPG system:
- Stress ranges from 0-10
- Players can add stress dice for extra chances to succeed
- Each stress die adds +1 stress
- Rolling 1s on stress dice triggers panic (d6 + stress on panic table)
- Strong successes (3+ successes above DC) reduce stress by 1

After running this migration:
- All existing player stories will have stress = 0
- All adventure templates will include stress in their starting state
- YZE system will properly track stress during gameplay
- Other RPG systems will ignore the field (harmless)

The JSONB format automatically handles the new field from TypeScript,
so no schema changes are needed - just data migration for existing records.
*/
