-- User API Keys Migration
-- Adds encrypted API key storage for BYOK (Bring Your Own Key) support
--
-- Keys are encrypted using AES-256-GCM on the application layer
-- This table only stores the encrypted blob

-- Create user_api_keys table
CREATE TABLE IF NOT EXISTS public.user_api_keys (
    user_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    encrypted_keys TEXT NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Add comment explaining the encryption
COMMENT ON TABLE public.user_api_keys IS 'Stores encrypted API keys for BYOK support. Keys are encrypted with AES-256-GCM on the application layer.';
COMMENT ON COLUMN public.user_api_keys.encrypted_keys IS 'AES-256-GCM encrypted JSON blob containing API keys. Format: iv:tag:ciphertext';

-- Enable RLS
ALTER TABLE public.user_api_keys ENABLE ROW LEVEL SECURITY;

-- RLS Policies
-- Users can only access their own keys
DROP POLICY IF EXISTS "Users can view own api keys" ON public.user_api_keys;
CREATE POLICY "Users can view own api keys" ON public.user_api_keys
    FOR SELECT USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can insert own api keys" ON public.user_api_keys;
CREATE POLICY "Users can insert own api keys" ON public.user_api_keys
    FOR INSERT WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can update own api keys" ON public.user_api_keys;
CREATE POLICY "Users can update own api keys" ON public.user_api_keys
    FOR UPDATE USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can delete own api keys" ON public.user_api_keys;
CREATE POLICY "Users can delete own api keys" ON public.user_api_keys
    FOR DELETE USING (auth.uid() = user_id);

-- Create index for faster lookups
CREATE INDEX IF NOT EXISTS idx_user_api_keys_user_id ON public.user_api_keys(user_id);

-- Update trigger for updated_at
DROP TRIGGER IF EXISTS update_user_api_keys_updated_at ON public.user_api_keys;
CREATE TRIGGER update_user_api_keys_updated_at 
    BEFORE UPDATE ON public.user_api_keys
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
