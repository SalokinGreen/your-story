-- Migration: Add starting_choices column to adventures table
-- This allows creators to define custom starting choices for their adventures
-- instead of the default "Start Story" button

-- Add the starting_choices column as JSONB
ALTER TABLE adventures 
ADD COLUMN IF NOT EXISTS starting_choices JSONB DEFAULT NULL;

-- Add a comment explaining the column
COMMENT ON COLUMN adventures.starting_choices IS 'Array of StartingChoice objects for custom adventure start options. Format: [{text: string, intro_override?: string, skill_used?: string, skill_dc?: number, resource_used?: string, item_used?: string, item_loss?: boolean, mythic_check?: string, mythic_context_only?: boolean, mythic_table?: string, custom_table?: string}]';

-- Create an index for querying adventures with custom starting choices
CREATE INDEX IF NOT EXISTS idx_adventures_has_starting_choices 
ON adventures ((starting_choices IS NOT NULL));
