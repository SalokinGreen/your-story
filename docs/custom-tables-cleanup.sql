-- Custom Tables Category Field Cleanup Migration
-- Remove 'category' field from all customTables in adventures.story_template
-- Run this in Supabase SQL Editor

-- Update all adventures that have customTables to remove the category field
UPDATE adventures
SET story_template = jsonb_set(
  story_template,
  '{customTables}',
  (
    SELECT jsonb_agg(
      jsonb_build_object(
        'id', table_item->>'id',
        'name', table_item->>'name',
        'description', table_item->>'description',
        'entries', table_item->'entries'
      )
    )
    FROM jsonb_array_elements(story_template->'customTables') AS table_item
  ),
  true
)
WHERE story_template ? 'customTables'
  AND jsonb_array_length(story_template->'customTables') > 0;

-- Verify the migration (should show customTables without category field)
-- SELECT 
--   id, 
--   title,
--   story_template->'customTables' as custom_tables
-- FROM adventures
-- WHERE story_template ? 'customTables'
-- LIMIT 5;

-- Expected result: customTables should only have id, name, description, entries
-- No 'category' field should be present
