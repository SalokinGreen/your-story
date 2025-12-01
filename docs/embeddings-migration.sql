-- Embeddings Migration for Semantic Search
-- Enables pgvector for lore and memory retrieval
-- Run this in your Supabase SQL Editor

-- 1. Enable pgvector extension
CREATE EXTENSION IF NOT EXISTS vector;

-- 2. Create embeddings table
CREATE TABLE IF NOT EXISTS story_embeddings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  story_id UUID NOT NULL REFERENCES stories(id) ON DELETE CASCADE,
  entry_type TEXT NOT NULL CHECK (entry_type IN ('lore', 'memory', 'scene')),
  entry_key TEXT NOT NULL,        -- lore title, memory index, scene part index
  content TEXT NOT NULL,          -- the actual text that was embedded
  embedding vector(1024) NOT NULL, -- mistral-embed outputs 1024 dimensions
  importance SMALLINT DEFAULT 5 CHECK (importance >= 1 AND importance <= 10),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  
  UNIQUE(story_id, entry_type, entry_key)
);

-- 3. Create HNSW index for fast approximate nearest neighbor search
-- HNSW is faster than IVFFlat for < 1M vectors with better recall
CREATE INDEX IF NOT EXISTS story_embeddings_hnsw_idx 
  ON story_embeddings 
  USING hnsw (embedding vector_cosine_ops)
  WITH (m = 16, ef_construction = 64);

-- 4. Composite index for filtered searches
CREATE INDEX IF NOT EXISTS story_embeddings_story_type_idx 
  ON story_embeddings(story_id, entry_type);

-- 5. Index for cleanup queries
CREATE INDEX IF NOT EXISTS story_embeddings_story_id_idx 
  ON story_embeddings(story_id);

-- 6. Enable RLS
ALTER TABLE story_embeddings ENABLE ROW LEVEL SECURITY;

-- 7. RLS Policies
-- Users can view embeddings for their own stories
CREATE POLICY "Users can view own story embeddings"
  ON story_embeddings FOR SELECT
  USING (
    story_id IN (
      SELECT id FROM stories WHERE user_id = auth.uid()
    )
  );

-- Users can insert embeddings for their own stories
CREATE POLICY "Users can insert own story embeddings"
  ON story_embeddings FOR INSERT
  WITH CHECK (
    story_id IN (
      SELECT id FROM stories WHERE user_id = auth.uid()
    )
  );

-- Users can update embeddings for their own stories
CREATE POLICY "Users can update own story embeddings"
  ON story_embeddings FOR UPDATE
  USING (
    story_id IN (
      SELECT id FROM stories WHERE user_id = auth.uid()
    )
  );

-- Users can delete embeddings for their own stories
CREATE POLICY "Users can delete own story embeddings"
  ON story_embeddings FOR DELETE
  USING (
    story_id IN (
      SELECT id FROM stories WHERE user_id = auth.uid()
    )
  );

-- 8. Search function for a specific entry type
CREATE OR REPLACE FUNCTION search_story_embeddings(
  p_story_id UUID,
  p_entry_type TEXT,
  p_query_embedding vector(1024),
  p_limit INT DEFAULT 10,
  p_min_similarity FLOAT DEFAULT 0.25
)
RETURNS TABLE(
  entry_key TEXT,
  content TEXT,
  similarity FLOAT,
  importance SMALLINT
)
LANGUAGE sql STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT 
    se.entry_key,
    se.content,
    (1 - (se.embedding <=> p_query_embedding))::FLOAT AS similarity,
    se.importance
  FROM story_embeddings se
  WHERE se.story_id = p_story_id
    AND se.entry_type = p_entry_type
    AND (1 - (se.embedding <=> p_query_embedding)) >= p_min_similarity
  ORDER BY se.embedding <=> p_query_embedding
  LIMIT p_limit;
$$;

-- 9. Combined search function for lore and memories in one call
CREATE OR REPLACE FUNCTION search_story_context(
  p_story_id UUID,
  p_query_embedding vector(1024),
  p_lore_limit INT DEFAULT 8,
  p_memory_limit INT DEFAULT 15,
  p_min_similarity FLOAT DEFAULT 0.25
)
RETURNS TABLE(
  entry_type TEXT,
  entry_key TEXT,
  content TEXT,
  similarity FLOAT,
  importance SMALLINT
)
LANGUAGE sql STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  (
    SELECT 
      'lore'::TEXT AS entry_type,
      entry_key,
      content,
      similarity,
      importance
    FROM search_story_embeddings(p_story_id, 'lore', p_query_embedding, p_lore_limit, p_min_similarity)
  )
  UNION ALL
  (
    SELECT 
      'memory'::TEXT AS entry_type,
      entry_key,
      content,
      similarity,
      importance
    FROM search_story_embeddings(p_story_id, 'memory', p_query_embedding, p_memory_limit, p_min_similarity)
  );
$$;

-- 10. Upsert function for batch embedding insertion
CREATE OR REPLACE FUNCTION upsert_story_embeddings(
  p_records JSONB
)
RETURNS INT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_count INT := 0;
  v_record JSONB;
BEGIN
  FOR v_record IN SELECT * FROM jsonb_array_elements(p_records)
  LOOP
    INSERT INTO story_embeddings (
      story_id,
      entry_type,
      entry_key,
      content,
      embedding,
      importance,
      updated_at
    ) VALUES (
      (v_record->>'story_id')::UUID,
      v_record->>'entry_type',
      v_record->>'entry_key',
      v_record->>'content',
      (v_record->>'embedding')::vector(1024),
      COALESCE((v_record->>'importance')::SMALLINT, 5),
      NOW()
    )
    ON CONFLICT (story_id, entry_type, entry_key)
    DO UPDATE SET
      content = EXCLUDED.content,
      embedding = EXCLUDED.embedding,
      importance = EXCLUDED.importance,
      updated_at = NOW();
    
    v_count := v_count + 1;
  END LOOP;
  
  RETURN v_count;
END;
$$;

-- 11. Cleanup function to remove orphaned embeddings
CREATE OR REPLACE FUNCTION cleanup_story_embeddings(
  p_story_id UUID,
  p_entry_type TEXT,
  p_valid_keys TEXT[]
)
RETURNS INT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_deleted INT;
BEGIN
  DELETE FROM story_embeddings
  WHERE story_id = p_story_id
    AND entry_type = p_entry_type
    AND NOT (entry_key = ANY(p_valid_keys));
  
  GET DIAGNOSTICS v_deleted = ROW_COUNT;
  RETURN v_deleted;
END;
$$;

-- 12. Grant execute permissions on functions
GRANT EXECUTE ON FUNCTION search_story_embeddings TO authenticated;
GRANT EXECUTE ON FUNCTION search_story_context TO authenticated;
GRANT EXECUTE ON FUNCTION upsert_story_embeddings TO authenticated;
GRANT EXECUTE ON FUNCTION cleanup_story_embeddings TO authenticated;
