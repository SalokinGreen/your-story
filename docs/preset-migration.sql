-- Migration: Add preset support to adventures and stories tables
-- Run this in your Supabase SQL Editor

-- Add selected_preset column to adventures table (if not exists)
ALTER TABLE public.adventures 
ADD COLUMN IF NOT EXISTS selected_preset TEXT;

-- Add presets array column to adventures table
ALTER TABLE public.adventures 
ADD COLUMN IF NOT EXISTS presets JSONB;

-- Add selected_preset column to stories table (if not exists)
ALTER TABLE public.stories 
ADD COLUMN IF NOT EXISTS selected_preset TEXT;

-- Add presets array column to stories table
ALTER TABLE public.stories 
ADD COLUMN IF NOT EXISTS presets JSONB;

-- Add comments for documentation
COMMENT ON COLUMN public.adventures.selected_preset IS 'ID of the character preset selected for this adventure (custom or author-created preset)';
COMMENT ON COLUMN public.adventures.presets IS 'Array of custom character presets created by the adventure author';
COMMENT ON COLUMN public.stories.selected_preset IS 'ID of the character preset selected for this story (custom or author-created preset)';
COMMENT ON COLUMN public.stories.presets IS 'Array of custom character presets available for this story';

-- Create index for faster preset filtering (optional, for future features)
CREATE INDEX IF NOT EXISTS idx_adventures_preset ON public.adventures(selected_preset);
CREATE INDEX IF NOT EXISTS idx_stories_preset ON public.stories(selected_preset);
