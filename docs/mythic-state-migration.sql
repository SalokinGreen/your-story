-- Advanced RPG Tools State Migration
-- Adds agmt_state JSONB column to stories and adventures tables
-- 
-- agmt_state structure:
-- {
--   "chaosFactor": 5,           // number (1-9, default 5)
--   "threads": [],              // array of {id, description, status, createdAt}
--   "characters": [],           // array of {id, name, role, status, createdAt}
--   "sceneCount": 0             // number (scenes played)
-- }

-- Add agmt_state to stories table
ALTER TABLE stories
ADD COLUMN IF NOT EXISTS agmt_state JSONB DEFAULT NULL;

-- Add agmt_state to adventures table
ALTER TABLE adventures
ADD COLUMN IF NOT EXISTS agmt_state JSONB DEFAULT NULL;

-- Add indexes for efficient JSON queries on chaos factor
CREATE INDEX IF NOT EXISTS idx_stories_agmt_chaos 
ON stories ((agmt_state->>'chaosFactor'));

CREATE INDEX IF NOT EXISTS idx_adventures_agmt_chaos 
ON adventures ((agmt_state->>'chaosFactor'));

-- Add comments for documentation
COMMENT ON COLUMN stories.agmt_state IS 'Advanced RPG Tools state: chaos factor (1-9), story threads, NPCs, scene count';
COMMENT ON COLUMN adventures.agmt_state IS 'Advanced RPG Tools state: chaos factor (1-9), story threads, NPCs, scene count';

-- Example usage:
-- Update chaos factor: UPDATE stories SET agmt_state = jsonb_set(COALESCE(agmt_state, '{}'), '{chaosFactor}', '7') WHERE id = 'story-id';
-- Add thread: UPDATE stories SET agmt_state = jsonb_set(COALESCE(agmt_state, '{\"threads\": []}'), '{threads}', (COALESCE(agmt_state->'threads', '[]'::jsonb) || '{"id":"thread1","description":"Find the artifact","status":"active","createdAt":1234567890}'::jsonb)) WHERE id = 'story-id';
