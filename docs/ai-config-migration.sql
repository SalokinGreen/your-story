-- Add ai_config column to user_settings for syncing AI presets across devices
-- Run this in your Supabase SQL Editor

DO $$ 
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                   WHERE table_schema = 'public' 
                   AND table_name = 'user_settings' 
                   AND column_name = 'ai_config') THEN
        ALTER TABLE public.user_settings ADD COLUMN ai_config JSONB DEFAULT '{}';
        
        RAISE NOTICE 'Added ai_config column to user_settings table';
    ELSE
        RAISE NOTICE 'ai_config column already exists';
    END IF;
END $$;

-- The ai_config JSONB column stores:
-- {
--   "currentPreset": "main" | "fast" | "quality" | "custom" | etc.,
--   "storyModel": "openrouter model id or custom model uuid",
--   "toolsModel": "...",
--   "choicesModel": "...",
--   "customMaxContext": 36000,
--   "customMaxOutput": 4000
-- }
