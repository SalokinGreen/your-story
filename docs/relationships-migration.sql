-- Migration: Add relationships field to adventures and stories tables
-- Date: 2025-11-20
-- Description: Adds JSONB column for storing relationship data in both adventures and stories

-- Add relationships column to adventures table
ALTER TABLE adventures
ADD COLUMN IF NOT EXISTS relationships JSONB DEFAULT '[]'::jsonb;

-- Add relationships column to stories table
ALTER TABLE stories
ADD COLUMN IF NOT EXISTS relationships JSONB DEFAULT '[]'::jsonb;

-- Add comments for documentation
COMMENT ON COLUMN adventures.relationships IS 'Array of relationship objects with name, value (-100 to +100), description, symbol, and optional custom_symbol_url';
COMMENT ON COLUMN stories.relationships IS 'Array of relationship objects with name, value (-100 to +100), description, symbol, and optional custom_symbol_url';

-- Create indexes for better query performance (optional but recommended)
CREATE INDEX IF NOT EXISTS idx_adventures_relationships ON adventures USING GIN (relationships);
CREATE INDEX IF NOT EXISTS idx_stories_relationships ON stories USING GIN (relationships);

-- Verify the changes
SELECT 
    table_name,
    column_name,
    data_type,
    column_default
FROM information_schema.columns
WHERE table_name IN ('adventures', 'stories')
AND column_name = 'relationships';
