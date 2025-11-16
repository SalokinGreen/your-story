-- Migration: Add Momentum System to Existing Stories
-- Run this in your Supabase SQL Editor after the momentum system is deployed
-- This adds momentum and maxMomentum fields to all existing story_data JSONB

-- ============================================
-- ADD MOMENTUM TO EXISTING STORIES
-- ============================================

-- Update all existing stories to add momentum fields
-- Sets default values: momentum = 3, maxMomentum = 5
UPDATE public.stories
SET story_data = jsonb_set(
    jsonb_set(
        story_data,
        '{momentum}',
        '3',
        true
    ),
    '{maxMomentum}',
    '5',
    true
)
WHERE story_data->>'momentum' IS NULL;

-- Verify the update
SELECT 
    id,
    story_name,
    story_data->>'momentum' as momentum,
    story_data->>'maxMomentum' as max_momentum,
    updated_at
FROM public.stories
LIMIT 10;

-- ============================================
-- ADD MOMENTUM TO EXISTING ADVENTURE TEMPLATES
-- ============================================

-- Update all existing adventure templates to add momentum fields
-- This ensures new stories created from these adventures start with momentum
UPDATE public.adventures
SET story_template = jsonb_set(
    jsonb_set(
        story_template,
        '{momentum}',
        '3',
        true
    ),
    '{maxMomentum}',
    '5',
    true
)
WHERE story_template->>'momentum' IS NULL;

-- Verify the adventure template update
SELECT 
    id,
    title,
    story_template->>'momentum' as momentum,
    story_template->>'maxMomentum' as max_momentum,
    updated_at
FROM public.adventures
LIMIT 10;

-- ============================================
-- NOTES
-- ============================================

/*
This migration:
1. Adds momentum (default: 3) and maxMomentum (default: 5) to all existing stories
2. Updates adventure templates so new stories start with momentum
3. Uses jsonb_set with 'create_if_missing=true' to safely add new fields
4. Only updates records that don't already have momentum fields (idempotent)

After running this migration:
- All existing player stories will have 3/5 momentum
- All adventure templates will include momentum in their starting state
- New stories will automatically include momentum from the StoryData interface

The JSONB format automatically handles the new fields from TypeScript,
so no schema changes are needed - just data migration for existing records.
*/
