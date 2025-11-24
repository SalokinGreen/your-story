-- Mythic GME State Migration
-- Adds mythic_state JSONB column to stories and adventures tables
-- 
-- mythic_state structure:
-- {
--   "chaosFactor": 5,           // number (1-9, default 5)
--   "threads": [],              // array of {id, description, status, createdAt}
--   "characters": [],           // array of {id, name, role, status, createdAt}
--   "sceneCount": 0             // number (scenes played)
-- }

-- Add mythic_state to stories table
ALTER TABLE stories
ADD COLUMN IF NOT EXISTS mythic_state JSONB DEFAULT NULL;

-- Add mythic_state to adventures table
ALTER TABLE adventures
ADD COLUMN IF NOT EXISTS mythic_state JSONB DEFAULT NULL;

-- Add indexes for efficient JSON queries on chaos factor
CREATE INDEX IF NOT EXISTS idx_stories_mythic_chaos 
ON stories ((mythic_state->>'chaosFactor'));

CREATE INDEX IF NOT EXISTS idx_adventures_mythic_chaos 
ON adventures ((mythic_state->>'chaosFactor'));

-- Add comments for documentation
COMMENT ON COLUMN stories.mythic_state IS 'Mythic GME state: chaos factor (1-9), story threads, NPCs, scene count';
COMMENT ON COLUMN adventures.mythic_state IS 'Mythic GME state: chaos factor (1-9), story threads, NPCs, scene count';

-- Example usage:
-- Update chaos factor: UPDATE stories SET mythic_state = jsonb_set(COALESCE(mythic_state, '{}'), '{chaosFactor}', '7') WHERE id = 'story-id';
-- Add thread: UPDATE stories SET mythic_state = jsonb_set(COALESCE(mythic_state, '{\"threads\": []}'), '{threads}', (COALESCE(mythic_state->'threads', '[]'::jsonb) || '{"id":"thread1","description":"Find the artifact","status":"active","createdAt":1234567890}'::jsonb)) WHERE id = 'story-id';
