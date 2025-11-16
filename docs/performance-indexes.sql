-- Performance Optimization: Add missing indexes to reduce disk I/O
-- These indexes speed up common queries and reduce table scans
-- Safe to run multiple times (uses IF NOT EXISTS)

-- Stories table: optimize user queries sorted by updated_at
CREATE INDEX IF NOT EXISTS idx_stories_user_updated 
ON stories(user_id, updated_at DESC);

-- Stories table: optimize public story queries
CREATE INDEX IF NOT EXISTS idx_stories_public_updated 
ON stories(updated_at DESC) 
WHERE is_public = true;

-- Adventures table: optimize published adventures with rating sort
CREATE INDEX IF NOT EXISTS idx_adventures_published_rating 
ON adventures(is_published, rating DESC) 
WHERE is_published = true;

-- Adventures table: optimize featured adventures
CREATE INDEX IF NOT EXISTS idx_adventures_featured 
ON adventures(is_featured, popularity DESC) 
WHERE is_featured = true;

-- Token ownerships: optimize owner lookups
CREATE INDEX IF NOT EXISTS idx_token_ownerships_owner 
ON token_ownerships(owner_id, acquired_at DESC);

-- Tokens: optimize creator lookups
CREATE INDEX IF NOT EXISTS idx_tokens_creator 
ON tokens(creator_id, minted_at DESC);

-- Listings: optimize active listings
CREATE INDEX IF NOT EXISTS idx_listings_active 
ON listings(status, created_at DESC) 
WHERE status = 'active';

-- Trades: optimize trade history queries
CREATE INDEX IF NOT EXISTS idx_trades_buyer 
ON trades(buyer_id, executed_at DESC);

CREATE INDEX IF NOT EXISTS idx_trades_seller 
ON trades(seller_id, executed_at DESC);

-- Profiles: optimize profile lookups
CREATE INDEX IF NOT EXISTS idx_profiles_display_name 
ON profiles(display_name) 
WHERE display_name IS NOT NULL;

-- Comments: optimize user comment history
CREATE INDEX IF NOT EXISTS idx_comments_user_created 
ON comments(user_id, created_at DESC);

-- Story folders: already has idx_story_folders_user_id, verify it exists
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_indexes 
    WHERE schemaname = 'public' 
    AND tablename = 'story_folders' 
    AND indexname = 'idx_story_folders_user_id'
  ) THEN
    CREATE INDEX idx_story_folders_user_id ON story_folders(user_id);
  END IF;
END $$;

-- Verification: List all new indexes
SELECT 
  schemaname,
  tablename,
  indexname,
  pg_size_pretty(pg_relation_size(indexrelid)) as index_size
FROM pg_indexes
JOIN pg_class ON pg_class.relname = indexname
WHERE schemaname = 'public'
  AND indexname LIKE 'idx_%'
ORDER BY tablename, indexname;

-- Check for bloated tables that might need VACUUM
SELECT
  schemaname,
  tablename,
  pg_size_pretty(pg_total_relation_size(schemaname||'.'||tablename)) as total_size,
  pg_size_pretty(pg_relation_size(schemaname||'.'||tablename)) as table_size,
  pg_size_pretty(pg_indexes_size(schemaname||'.'||tablename)) as indexes_size,
  n_live_tup as live_rows,
  n_dead_tup as dead_rows,
  ROUND(100 * n_dead_tup / NULLIF(n_live_tup + n_dead_tup, 0), 2) as dead_pct
FROM pg_stat_user_tables
WHERE schemaname = 'public'
ORDER BY pg_total_relation_size(schemaname||'.'||tablename) DESC;
