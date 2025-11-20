-- Add nsfw column to adventures table
ALTER TABLE public.adventures ADD COLUMN IF NOT EXISTS nsfw BOOLEAN DEFAULT false;

-- Add index for nsfw filtering
CREATE INDEX IF NOT EXISTS idx_adventures_nsfw ON public.adventures(nsfw);

-- Add nsfw column to stories table
ALTER TABLE public.stories ADD COLUMN IF NOT EXISTS nsfw BOOLEAN DEFAULT false;
