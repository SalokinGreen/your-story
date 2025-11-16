-- EMERGENCY: Lightweight index creation for overloaded database
-- Run these ONE AT A TIME to avoid overwhelming the database
-- Wait 30 seconds between each command

-- Step 1: Most critical - Stories user queries (your main bottleneck)
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_stories_user_updated 
ON stories(user_id, updated_at DESC);

-- Step 2: Token ownerships (heavy queries)
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_token_ownerships_owner 
ON token_ownerships(owner_id);

-- Step 3: Adventures published queries
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_adventures_published_rating 
ON adventures(is_published, rating DESC) 
WHERE is_published = true;

-- Step 4: Public stories
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_stories_public_updated 
ON stories(updated_at DESC) 
WHERE is_public = true;

-- Step 5: Verify indexes were created
SELECT 
  tablename,
  indexname,
  pg_size_pretty(pg_relation_size(indexrelid)) as size
FROM pg_indexes
JOIN pg_class ON pg_class.relname = indexname
WHERE schemaname = 'public'
  AND indexname IN (
    'idx_stories_user_updated',
    'idx_token_ownerships_owner', 
    'idx_adventures_published_rating',
    'idx_stories_public_updated'
  );
