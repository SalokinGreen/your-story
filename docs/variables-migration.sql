-- Variables Migration
-- Adds variables column to stories and adventures tables
-- Variables are typed containers (numbers, booleans, lists) for dynamic game state

-- Add variables column to stories table
ALTER TABLE stories
ADD COLUMN IF NOT EXISTS variables JSONB DEFAULT '[]'::jsonb;

-- Add variables column to adventures table
ALTER TABLE adventures
ADD COLUMN IF NOT EXISTS variables JSONB DEFAULT '[]'::jsonb;

-- Add index for variables queries (optional, for performance if filtering by variables)
CREATE INDEX IF NOT EXISTS idx_stories_variables ON stories USING GIN (variables);
CREATE INDEX IF NOT EXISTS idx_adventures_variables ON adventures USING GIN (variables);

-- Example variable structure:
-- [
--   {
--     "id": "var_1",
--     "name": "Health",
--     "description": "Current health points",
--     "type": "number",
--     "value": 100,
--     "minValue": 0,
--     "maxValue": 100
--   },
--   {
--     "id": "var_2", 
--     "name": "Is Wanted",
--     "description": "Whether the player is wanted by authorities",
--     "type": "boolean",
--     "value": false
--   },
--   {
--     "id": "var_3",
--     "name": "Known Spells",
--     "description": "Spells the player has learned",
--     "type": "list",
--     "items": ["Fireball", "Heal"],
--     "maxSize": 10
--   }
-- ]
