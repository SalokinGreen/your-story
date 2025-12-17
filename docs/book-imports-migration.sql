-- Book Imports Migration
-- Allows users to share successful PDF/RPG book imports for community reimport

-- Create the book_imports table
CREATE TABLE IF NOT EXISTS book_imports (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  
  -- Metadata
  name TEXT NOT NULL,                    -- Display name for the import
  description TEXT,                      -- Optional description
  source_book TEXT,                      -- Original book/PDF name
  system TEXT,                           -- RPG system (D&D 5e, Pathfinder, etc.)
  tags TEXT[] DEFAULT '{}',              -- Searchable tags
  
  -- Content counts (for display without loading full data)
  lore_count INTEGER DEFAULT 0,
  mechanics_count INTEGER DEFAULT 0,
  tables_count INTEGER DEFAULT 0,
  
  -- The actual imported data (JSONB for flexibility)
  lore JSONB DEFAULT '[]'::jsonb,        -- Array of StoryLore
  mechanic_notes JSONB DEFAULT '[]'::jsonb, -- Array of StoryLore (type: mechanics)
  custom_tables JSONB DEFAULT '[]'::jsonb,  -- Array of CustomTable
  
  -- Visibility and stats
  is_public BOOLEAN DEFAULT true,        -- Whether visible in community browser
  downloads INTEGER DEFAULT 0,           -- Download/use count
  
  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Create indexes for efficient queries
CREATE INDEX idx_book_imports_user_id ON book_imports(user_id);
CREATE INDEX idx_book_imports_is_public ON book_imports(is_public) WHERE is_public = true;
CREATE INDEX idx_book_imports_system ON book_imports(system);
CREATE INDEX idx_book_imports_created_at ON book_imports(created_at DESC);
CREATE INDEX idx_book_imports_downloads ON book_imports(downloads DESC);

-- Full text search on name, description, source_book
CREATE INDEX idx_book_imports_search ON book_imports 
  USING GIN (to_tsvector('english', coalesce(name, '') || ' ' || coalesce(description, '') || ' ' || coalesce(source_book, '')));

-- GIN index for tags array search
CREATE INDEX idx_book_imports_tags ON book_imports USING GIN (tags);

-- Enable RLS
ALTER TABLE book_imports ENABLE ROW LEVEL SECURITY;

-- Policy: Users can view their own imports
CREATE POLICY "Users can view own imports"
  ON book_imports FOR SELECT
  USING (auth.uid() = user_id);

-- Policy: Anyone can view public imports
CREATE POLICY "Anyone can view public imports"
  ON book_imports FOR SELECT
  USING (is_public = true);

-- Policy: Users can insert their own imports
CREATE POLICY "Users can insert own imports"
  ON book_imports FOR INSERT
  WITH CHECK (auth.uid() = user_id);

-- Policy: Users can update their own imports
CREATE POLICY "Users can update own imports"
  ON book_imports FOR UPDATE
  USING (auth.uid() = user_id);

-- Policy: Users can delete their own imports
CREATE POLICY "Users can delete own imports"
  ON book_imports FOR DELETE
  USING (auth.uid() = user_id);

-- Function to increment download count
CREATE OR REPLACE FUNCTION increment_book_import_downloads(import_id UUID)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE book_imports
  SET downloads = downloads + 1
  WHERE id = import_id;
END;
$$;

-- Trigger to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_book_imports_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER book_imports_updated_at
  BEFORE UPDATE ON book_imports
  FOR EACH ROW
  EXECUTE FUNCTION update_book_imports_updated_at();
