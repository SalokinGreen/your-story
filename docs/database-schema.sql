-- Database Schema for Your Story Application
-- Run this in your Supabase SQL Editor

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ============================================
-- ADVENTURES TABLE
-- ============================================
CREATE TABLE IF NOT EXISTS public.adventures (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    title TEXT NOT NULL,
    description TEXT NOT NULL,
    short_description TEXT NOT NULL,
    author_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
    author_name TEXT NOT NULL,
    thumbnail_url TEXT,
    banner_url TEXT,
    tags TEXT[] DEFAULT '{}',
    difficulty TEXT NOT NULL CHECK (difficulty IN ('easy', 'medium', 'hard', 'expert')),
    estimated_duration TEXT NOT NULL,
    popularity INTEGER DEFAULT 0,
    rating NUMERIC(3,2) DEFAULT 0,
    play_count INTEGER DEFAULT 0,
    is_published BOOLEAN DEFAULT false,
    is_featured BOOLEAN DEFAULT false,
    story_template JSONB NOT NULL, -- Stores the full StoryData object
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Add indexes for better query performance
CREATE INDEX IF NOT EXISTS idx_adventures_author ON public.adventures(author_id);
CREATE INDEX IF NOT EXISTS idx_adventures_published ON public.adventures(is_published);
CREATE INDEX IF NOT EXISTS idx_adventures_featured ON public.adventures(is_featured);
CREATE INDEX IF NOT EXISTS idx_adventures_popularity ON public.adventures(popularity DESC);
CREATE INDEX IF NOT EXISTS idx_adventures_rating ON public.adventures(rating DESC);
CREATE INDEX IF NOT EXISTS idx_adventures_created ON public.adventures(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_adventures_tags ON public.adventures USING GIN(tags);

-- Enable Row Level Security
ALTER TABLE public.adventures ENABLE ROW LEVEL SECURITY;

-- Policies for adventures
-- Anyone can view published adventures
CREATE POLICY "Adventures are viewable by everyone" ON public.adventures
    FOR SELECT USING (is_published = true OR auth.uid() = author_id);

-- Users can create their own adventures
CREATE POLICY "Users can create adventures" ON public.adventures
    FOR INSERT WITH CHECK (auth.uid() = author_id);

-- Users can update their own adventures
CREATE POLICY "Users can update own adventures" ON public.adventures
    FOR UPDATE USING (auth.uid() = author_id);

-- Users can delete their own adventures
CREATE POLICY "Users can delete own adventures" ON public.adventures
    FOR DELETE USING (auth.uid() = author_id);

-- ============================================
-- COMMENTS TABLE
-- ============================================
CREATE TABLE IF NOT EXISTS public.comments (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    adventure_id UUID NOT NULL REFERENCES public.adventures(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    user_name TEXT NOT NULL,
    user_avatar TEXT,
    content TEXT NOT NULL,
    rating INTEGER CHECK (rating >= 1 AND rating <= 5),
    likes INTEGER DEFAULT 0,
    liked_by UUID[] DEFAULT '{}',
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Add indexes for comments
CREATE INDEX IF NOT EXISTS idx_comments_adventure ON public.comments(adventure_id);
CREATE INDEX IF NOT EXISTS idx_comments_user ON public.comments(user_id);
CREATE INDEX IF NOT EXISTS idx_comments_created ON public.comments(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_comments_likes ON public.comments(likes DESC);

-- Enable Row Level Security
ALTER TABLE public.comments ENABLE ROW LEVEL SECURITY;

-- Policies for comments
-- Anyone can view comments
CREATE POLICY "Comments are viewable by everyone" ON public.comments
    FOR SELECT USING (true);

-- Authenticated users can create comments
CREATE POLICY "Authenticated users can create comments" ON public.comments
    FOR INSERT WITH CHECK (auth.uid() = user_id);

-- Users can update their own comments
CREATE POLICY "Users can update own comments" ON public.comments
    FOR UPDATE USING (auth.uid() = user_id);

-- Users can delete their own comments
CREATE POLICY "Users can delete own comments" ON public.comments
    FOR DELETE USING (auth.uid() = user_id);

-- ============================================
-- STORIES TABLE (User instances of adventures)
-- ============================================
CREATE TABLE IF NOT EXISTS public.stories (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    adventure_id UUID REFERENCES public.adventures(id) ON DELETE SET NULL, -- Can be null if adventure is deleted
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    story_name TEXT NOT NULL,
    story_data JSONB NOT NULL, -- Full StoryData with current progress (includes momentum system)
    is_completed BOOLEAN DEFAULT false,
    is_public BOOLEAN DEFAULT false, -- Allow users to share their stories
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Note: story_data JSONB includes:
-- - All story state (scenes, choices, chapters)
-- - Player stats, resources, inventory, achievements
-- - Momentum system: { momentum: number, maxMomentum: number }
-- - Plot beats and memory
-- See app/misc/structs.ts StoryData interface for full structure

-- Add indexes for stories
CREATE INDEX IF NOT EXISTS idx_stories_user ON public.stories(user_id);
CREATE INDEX IF NOT EXISTS idx_stories_adventure ON public.stories(adventure_id);
CREATE INDEX IF NOT EXISTS idx_stories_created ON public.stories(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_stories_public ON public.stories(is_public) WHERE is_public = true;

-- Enable Row Level Security
ALTER TABLE public.stories ENABLE ROW LEVEL SECURITY;

-- Policies for stories
-- Users can view their own stories and public stories from others
CREATE POLICY "Users can view own stories and public stories" ON public.stories
    FOR SELECT USING (auth.uid() = user_id OR is_public = true);

-- Users can create their own stories
CREATE POLICY "Users can create stories" ON public.stories
    FOR INSERT WITH CHECK (auth.uid() = user_id);

-- Users can update their own stories
CREATE POLICY "Users can update own stories" ON public.stories
    FOR UPDATE USING (auth.uid() = user_id);

-- Users can delete their own stories
CREATE POLICY "Users can delete own stories" ON public.stories
    FOR DELETE USING (auth.uid() = user_id);

-- ============================================
-- FUNCTIONS AND TRIGGERS
-- ============================================

-- Function to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Triggers for updated_at
CREATE TRIGGER update_adventures_updated_at BEFORE UPDATE ON public.adventures
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_comments_updated_at BEFORE UPDATE ON public.comments
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_stories_updated_at BEFORE UPDATE ON public.stories
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Function to update adventure rating based on comments
CREATE OR REPLACE FUNCTION update_adventure_rating()
RETURNS TRIGGER AS $$
BEGIN
    UPDATE public.adventures
    SET rating = (
        SELECT COALESCE(AVG(rating), 0)
        FROM public.comments
        WHERE adventure_id = NEW.adventure_id AND rating IS NOT NULL
    )
    WHERE id = NEW.adventure_id;
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Function to increment play_count when a story is created for an adventure
CREATE OR REPLACE FUNCTION increment_adventure_play_count()
RETURNS TRIGGER AS $$
BEGIN
    IF NEW.adventure_id IS NOT NULL THEN
        UPDATE public.adventures
        SET play_count = play_count + 1
        WHERE id = NEW.adventure_id;
    END IF;
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Trigger: when a new story is created, bump the adventure's play_count
CREATE TRIGGER increment_play_count_on_story
AFTER INSERT ON public.stories
FOR EACH ROW EXECUTE FUNCTION increment_adventure_play_count();

-- Trigger to update rating when comment with rating is added
CREATE TRIGGER update_rating_on_comment AFTER INSERT OR UPDATE OR DELETE ON public.comments
    FOR EACH ROW EXECUTE FUNCTION update_adventure_rating();

-- ============================================
-- SEED DATA (Optional - for testing)
-- ============================================
-- Insert sample adventures if needed
-- Note: You may want to insert the sample_adventures data here
