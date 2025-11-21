-- Migration: Add rpgSystem field to adventures and stories tables
-- Date: 2025-11-21
-- Description: Adds rpgSystem column to support multiple dice systems (3d6, 1d20, 1d100, percentile)

-- Add rpgSystem column to adventures table
ALTER TABLE adventures
ADD COLUMN IF NOT EXISTS rpg_system TEXT CHECK (rpg_system IN ('3d6', '1d20', '1d100', 'percentile'));

-- Add rpgSystem column to stories table  
ALTER TABLE stories
ADD COLUMN IF NOT EXISTS rpg_system TEXT CHECK (rpg_system IN ('3d6', '1d20', '1d100', 'percentile'));

-- Set default to '3d6' for existing records (backward compatibility)
UPDATE adventures SET rpg_system = '3d6' WHERE rpg_system IS NULL;
UPDATE stories SET rpg_system = '3d6' WHERE rpg_system IS NULL;

-- Add comment explaining the column
COMMENT ON COLUMN adventures.rpg_system IS 'RPG dice system: 3d6 (bell curve), 1d20 (D&D flat), 1d100 (percentile flat), percentile (roll-under)';
COMMENT ON COLUMN stories.rpg_system IS 'RPG dice system: 3d6 (bell curve), 1d20 (D&D flat), 1d100 (percentile flat), percentile (roll-under)';

-- Verify migration
SELECT 
  'Adventures with rpg_system' AS table_name,
  COUNT(*) AS total_records,
  COUNT(rpg_system) AS records_with_system,
  COUNT(*) FILTER (WHERE rpg_system = '3d6') AS system_3d6,
  COUNT(*) FILTER (WHERE rpg_system = '1d20') AS system_1d20,
  COUNT(*) FILTER (WHERE rpg_system = '1d100') AS system_1d100,
  COUNT(*) FILTER (WHERE rpg_system = 'percentile') AS system_percentile
FROM adventures
UNION ALL
SELECT 
  'Stories with rpg_system' AS table_name,
  COUNT(*) AS total_records,
  COUNT(rpg_system) AS records_with_system,
  COUNT(*) FILTER (WHERE rpg_system = '3d6') AS system_3d6,
  COUNT(*) FILTER (WHERE rpg_system = '1d20') AS system_1d20,
  COUNT(*) FILTER (WHERE rpg_system = '1d100') AS system_1d100,
  COUNT(*) FILTER (WHERE rpg_system = 'percentile') AS system_percentile
FROM stories;
