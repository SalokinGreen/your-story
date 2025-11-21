-- Create user_settings table
CREATE TABLE IF NOT EXISTS public.user_settings (
    user_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    byok_enabled BOOLEAN DEFAULT false,
    is_subscriber BOOLEAN DEFAULT false,
    save_stories_locally BOOLEAN DEFAULT false,
    custom_models JSONB DEFAULT '[]',
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Add missing columns if they don't exist
DO $$ 
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                   WHERE table_schema = 'public' 
                   AND table_name = 'user_settings' 
                   AND column_name = 'byok_enabled') THEN
        ALTER TABLE public.user_settings ADD COLUMN byok_enabled BOOLEAN DEFAULT false;
    END IF;
    
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                   WHERE table_schema = 'public' 
                   AND table_name = 'user_settings' 
                   AND column_name = 'is_subscriber') THEN
        ALTER TABLE public.user_settings ADD COLUMN is_subscriber BOOLEAN DEFAULT false;
    END IF;
    
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                   WHERE table_schema = 'public' 
                   AND table_name = 'user_settings' 
                   AND column_name = 'save_stories_locally') THEN
        ALTER TABLE public.user_settings ADD COLUMN save_stories_locally BOOLEAN DEFAULT false;
    END IF;
    
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                   WHERE table_schema = 'public' 
                   AND table_name = 'user_settings' 
                   AND column_name = 'custom_models') THEN
        ALTER TABLE public.user_settings ADD COLUMN custom_models JSONB DEFAULT '[]';
    END IF;
    
    -- Migrate old custom_model_config to custom_models array if column exists
    IF EXISTS (SELECT 1 FROM information_schema.columns 
               WHERE table_schema = 'public' 
               AND table_name = 'user_settings' 
               AND column_name = 'custom_model_config') THEN
        -- Migrate data from old format to new format
        UPDATE public.user_settings 
        SET custom_models = CASE 
            WHEN custom_model_config IS NOT NULL 
                 AND custom_model_config::text != '{}'::text
            THEN jsonb_build_array(
                jsonb_build_object(
                    'id', gen_random_uuid()::text,
                    'modelId', custom_model_config->>'modelId',
                    'name', custom_model_config->>'name',
                    'contextSize', (custom_model_config->>'contextSize')::int,
                    'maxOutputTokens', (custom_model_config->>'maxOutputTokens')::int
                )
            )
            ELSE '[]'::jsonb
        END
        WHERE custom_models IS NULL OR custom_models::text = '[]'::text;
        
        -- Drop old column
        ALTER TABLE public.user_settings DROP COLUMN IF EXISTS custom_model_config;
    END IF;
END $$;

-- Enable RLS
ALTER TABLE public.user_settings ENABLE ROW LEVEL SECURITY;

-- Drop existing policies if they exist
DROP POLICY IF EXISTS "Users can view own settings" ON public.user_settings;
DROP POLICY IF EXISTS "Users can update own settings" ON public.user_settings;
DROP POLICY IF EXISTS "Users can insert own settings" ON public.user_settings;

-- Recreate policies
CREATE POLICY "Users can view own settings" ON public.user_settings
    FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can update own settings" ON public.user_settings
    FOR UPDATE USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own settings" ON public.user_settings
    FOR INSERT WITH CHECK (auth.uid() = user_id);

-- Drop trigger if exists and recreate
DROP TRIGGER IF EXISTS update_user_settings_updated_at ON public.user_settings;
CREATE TRIGGER update_user_settings_updated_at BEFORE UPDATE ON public.user_settings
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
