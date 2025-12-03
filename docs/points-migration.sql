-- Migration: Add points tracking to existing stories and adventures
-- This script adds the points system fields to all existing stories.
-- Safe to run multiple times (idempotent).
-- Uses batched updates to avoid timeouts on large datasets.

-- First, check how many records need updating
DO $$
DECLARE
    stories_to_update INTEGER;
    adventures_to_update INTEGER;
BEGIN
    SELECT COUNT(*) INTO stories_to_update
    FROM stories
    WHERE story_data->'points' IS NULL
       OR story_data->'earnedPointsFromChapters' IS NULL;
    
    SELECT COUNT(*) INTO adventures_to_update
    FROM adventures
    WHERE story_template->'points' IS NULL
       OR story_template->'earnedPointsFromChapters' IS NULL;
    
    RAISE NOTICE 'Stories to update: %', stories_to_update;
    RAISE NOTICE 'Adventures to update: %', adventures_to_update;
END $$;

-- Add points tracking to stories table (batched approach - 100 rows at a time)
DO $$
DECLARE
    batch_size INTEGER := 100;
    rows_updated INTEGER := 0;
    total_updated INTEGER := 0;
BEGIN
    LOOP
        WITH batch AS (
            SELECT id
            FROM stories
            WHERE story_data->'points' IS NULL
               OR story_data->'earnedPointsFromChapters' IS NULL
            LIMIT batch_size
        )
        UPDATE stories
        SET story_data = jsonb_set(
            jsonb_set(
                story_data,
                '{points}',
                '0',
                true
            ),
            '{earnedPointsFromChapters}',
            '[]',
            true
        )
        FROM batch
        WHERE stories.id = batch.id;
        
        GET DIAGNOSTICS rows_updated = ROW_COUNT;
        total_updated := total_updated + rows_updated;
        
        EXIT WHEN rows_updated = 0;
        
        RAISE NOTICE 'Updated % stories (total: %)', rows_updated, total_updated;
        
        -- Small delay between batches to avoid overwhelming the database
        PERFORM pg_sleep(0.1);
    END LOOP;
    
    RAISE NOTICE 'Stories migration complete. Total updated: %', total_updated;
END $$;

-- Add points tracking to adventures table (batched approach - 100 rows at a time)
DO $$
DECLARE
    batch_size INTEGER := 100;
    rows_updated INTEGER := 0;
    total_updated INTEGER := 0;
BEGIN
    LOOP
        WITH batch AS (
            SELECT id
            FROM adventures
            WHERE story_template->'points' IS NULL
               OR story_template->'earnedPointsFromChapters' IS NULL
            LIMIT batch_size
        )
        UPDATE adventures
        SET story_template = jsonb_set(
            jsonb_set(
                story_template,
                '{points}',
                '0',
                true
            ),
            '{earnedPointsFromChapters}',
            '[]',
            true
        )
        FROM batch
        WHERE adventures.id = batch.id;
        
        GET DIAGNOSTICS rows_updated = ROW_COUNT;
        total_updated := total_updated + rows_updated;
        
        EXIT WHEN rows_updated = 0;
        
        RAISE NOTICE 'Updated % adventures (total: %)', rows_updated, total_updated;
        
        -- Small delay between batches to avoid overwhelming the database
        PERFORM pg_sleep(0.1);
    END LOOP;
    
    RAISE NOTICE 'Adventures migration complete. Total updated: %', total_updated;
END $$;

-- Verify migration
SELECT 
    'Stories with points' as check_type,
    COUNT(*) as total_count,
    COUNT(*) FILTER (WHERE story_data->'points' IS NOT NULL) as migrated_count
FROM stories
UNION ALL
SELECT 
    'Adventures with points' as check_type,
    COUNT(*) as total_count,
    COUNT(*) FILTER (WHERE story_template->'points' IS NOT NULL) as migrated_count
FROM adventures;
