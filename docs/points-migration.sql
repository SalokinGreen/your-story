-- Migration: Add points tracking to existing stories and adventures
-- This script adds the points system fields to all existing stories.
-- Safe to run multiple times (idempotent).

-- Add points tracking to stories table
UPDATE stories
SET storyData = jsonb_set(
    jsonb_set(
        jsonb_set(
            storyData,
            '{points}',
            '0',
            true
        ),
        '{earnedPointsFromBeats}',
        '[]',
        true
    ),
    '{earnedPointsFromChapters}',
    '[]',
    true
)
WHERE storyData->'points' IS NULL
   OR storyData->'earnedPointsFromBeats' IS NULL
   OR storyData->'earnedPointsFromChapters' IS NULL;

-- Add points tracking to adventures table (templates)
UPDATE adventures
SET storyData = jsonb_set(
    jsonb_set(
        jsonb_set(
            storyData,
            '{points}',
            '0',
            true
        ),
        '{earnedPointsFromBeats}',
        '[]',
        true
    ),
    '{earnedPointsFromChapters}',
    '[]',
    true
)
WHERE storyData->'points' IS NULL
   OR storyData->'earnedPointsFromBeats' IS NULL
   OR storyData->'earnedPointsFromChapters' IS NULL;

-- Verify migration
SELECT 
    'Stories with points' as check_type,
    COUNT(*) as count
FROM stories
WHERE storyData->'points' IS NOT NULL
UNION ALL
SELECT 
    'Adventures with points' as check_type,
    COUNT(*) as count
FROM adventures
WHERE storyData->'points' IS NOT NULL;
