-- EMERGENCY DIAGNOSTIC: Run this first to see what's causing the overload
-- This query is lightweight and safe to run

-- 1. Check current active connections
SELECT 
  count(*) as total_connections,
  count(*) FILTER (WHERE state = 'active') as active_queries,
  count(*) FILTER (WHERE state = 'idle') as idle_connections,
  count(*) FILTER (WHERE state = 'idle in transaction') as idle_in_transaction
FROM pg_stat_activity
WHERE datname = current_database();

-- 2. Find long-running queries that might be blocking
SELECT 
  pid,
  now() - query_start as duration,
  state,
  left(query, 100) as query_preview
FROM pg_stat_activity
WHERE state != 'idle'
  AND query NOT LIKE '%pg_stat_activity%'
ORDER BY query_start ASC;

-- 3. Check table sizes (identify your largest tables)
SELECT 
  schemaname || '.' || tablename as table_name,
  pg_size_pretty(pg_total_relation_size(schemaname||'.'||tablename)) as total_size,
  pg_size_pretty(pg_relation_size(schemaname||'.'||tablename)) as table_size,
  n_live_tup as rows
FROM pg_stat_user_tables
WHERE schemaname = 'public'
ORDER BY pg_total_relation_size(schemaname||'.'||tablename) DESC
LIMIT 10;

-- 4. Check for missing indexes on foreign keys (major bottleneck source)
SELECT 
  c.conrelid::regclass as table_name,
  string_agg(a.attname, ', ') as column_names
FROM pg_constraint c
JOIN pg_attribute a ON a.attnum = ANY(c.conkey) AND a.attrelid = c.conrelid
WHERE c.contype = 'f'  -- foreign key constraints
  AND NOT EXISTS (
    SELECT 1 FROM pg_index i
    WHERE i.indrelid = c.conrelid
      AND c.conkey::text = i.indkey::text
  )
GROUP BY c.conrelid, c.conname;

-- 5. Check dead tuple percentage (indicates VACUUM needed)
SELECT
  schemaname || '.' || tablename as table_name,
  n_live_tup as live_rows,
  n_dead_tup as dead_rows,
  ROUND(100 * n_dead_tup / NULLIF(n_live_tup + n_dead_tup, 0), 2) as dead_pct
FROM pg_stat_user_tables
WHERE schemaname = 'public'
  AND n_dead_tup > 1000
ORDER BY n_dead_tup DESC;
