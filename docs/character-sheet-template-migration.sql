-- Migration: Add character_sheet_template column to adventures table
-- This stores the fillable character sheet template for custom character creation
-- Run this in your Supabase SQL Editor

-- Add the column to adventures table
ALTER TABLE public.adventures 
ADD COLUMN IF NOT EXISTS character_sheet_template JSONB DEFAULT NULL;

-- Add comment for documentation
COMMENT ON COLUMN public.adventures.character_sheet_template IS 
'Stores the fillable character sheet template for custom character creation. Structure: { template: string, fields: { name: string, description: string, defaultValue: string }[] }';
