-- Create story_folders table first
CREATE TABLE IF NOT EXISTS story_folders (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  color TEXT DEFAULT '#9333ea',
  icon TEXT DEFAULT '📁',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id, name)
);

-- Add folder support to stories table (after story_folders exists)
ALTER TABLE stories ADD COLUMN IF NOT EXISTS folder_id UUID REFERENCES story_folders(id) ON DELETE SET NULL;

-- Enable RLS
ALTER TABLE story_folders ENABLE ROW LEVEL SECURITY;

-- RLS Policies for story_folders
CREATE POLICY "Users can view their own folders"
  ON story_folders FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own folders"
  ON story_folders FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own folders"
  ON story_folders FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own folders"
  ON story_folders FOR DELETE
  USING (auth.uid() = user_id);

-- Create index for better performance
CREATE INDEX IF NOT EXISTS idx_story_folders_user_id ON story_folders(user_id);
CREATE INDEX IF NOT EXISTS idx_stories_folder_id ON stories(folder_id);
