-- Fix RLS policy for user_settings to allow proper INSERT during signup
-- This allows both authenticated users AND service role to insert settings

-- Drop existing policies
DROP POLICY IF EXISTS "Users can view own settings" ON public.user_settings;
DROP POLICY IF EXISTS "Users can update own settings" ON public.user_settings;
DROP POLICY IF EXISTS "Users can insert own settings" ON public.user_settings;
DROP POLICY IF EXISTS "Service role can manage all settings" ON public.user_settings;

-- Recreate policies with proper permissions
CREATE POLICY "Users can view own settings" ON public.user_settings
    FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can update own settings" ON public.user_settings
    FOR UPDATE USING (auth.uid() = user_id);

-- Updated INSERT policy: Allow if user_id matches auth.uid()
-- This policy now properly handles the case where auth.uid() is set
CREATE POLICY "Users can insert own settings" ON public.user_settings
    FOR INSERT WITH CHECK (auth.uid() = user_id);

-- Add service role policy for full access (bypasses RLS anyway, but explicit is good)
CREATE POLICY "Service role can manage all settings" ON public.user_settings
    FOR ALL USING (true) WITH CHECK (true);

-- Create a function to automatically create user_settings on user signup
-- This runs as a database trigger with elevated privileges
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
    INSERT INTO public.user_settings (user_id)
    VALUES (NEW.id)
    ON CONFLICT (user_id) DO NOTHING;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Drop trigger if exists
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;

-- Create trigger to automatically create user_settings when a new user is created
CREATE TRIGGER on_auth_user_created
    AFTER INSERT ON auth.users
    FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- Backfill user_settings for existing users who don't have settings yet
INSERT INTO public.user_settings (user_id)
SELECT id FROM auth.users
WHERE id NOT IN (SELECT user_id FROM public.user_settings)
ON CONFLICT (user_id) DO NOTHING;
