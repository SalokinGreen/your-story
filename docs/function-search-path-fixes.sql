-- Function Search Path Security Fixes
-- Sets explicit search_path on functions to prevent search_path injection attacks
-- Reference: https://supabase.com/docs/guides/database/database-linter?lint=0011_function_search_path_mutable

-- Fix: handle_new_user
-- Sets search_path to empty string for security (only qualified names allowed)
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_proc p
    JOIN pg_namespace n ON p.pronamespace = n.oid
    WHERE n.nspname = 'public' AND p.proname = 'handle_new_user'
  ) THEN
    ALTER FUNCTION public.handle_new_user() SET search_path = '';
    RAISE NOTICE 'Updated search_path for handle_new_user';
  END IF;
END $$;

-- Fix: update_adventure_rating
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_proc p
    JOIN pg_namespace n ON p.pronamespace = n.oid
    WHERE n.nspname = 'public' AND p.proname = 'update_adventure_rating'
  ) THEN
    ALTER FUNCTION public.update_adventure_rating() SET search_path = '';
    RAISE NOTICE 'Updated search_path for update_adventure_rating';
  END IF;
END $$;

-- Fix: update_updated_at_column
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_proc p
    JOIN pg_namespace n ON p.pronamespace = n.oid
    WHERE n.nspname = 'public' AND p.proname = 'update_updated_at_column'
  ) THEN
    ALTER FUNCTION public.update_updated_at_column() SET search_path = '';
    RAISE NOTICE 'Updated search_path for update_updated_at_column';
  END IF;
END $$;

-- Fix: is_tradable_token
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_proc p
    JOIN pg_namespace n ON p.pronamespace = n.oid
    WHERE n.nspname = 'public' AND p.proname = 'is_tradable_token'
  ) THEN
    ALTER FUNCTION public.is_tradable_token(uuid) SET search_path = '';
    RAISE NOTICE 'Updated search_path for is_tradable_token';
  END IF;
END $$;

-- Fix: execute_trade
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_proc p
    JOIN pg_namespace n ON p.pronamespace = n.oid
    WHERE n.nspname = 'public' AND p.proname = 'execute_trade'
  ) THEN
    ALTER FUNCTION public.execute_trade(uuid, uuid) SET search_path = '';
    RAISE NOTICE 'Updated search_path for execute_trade';
  END IF;
END $$;

-- Fix: handle_updated_at
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_proc p
    JOIN pg_namespace n ON p.pronamespace = n.oid
    WHERE n.nspname = 'public' AND p.proname = 'handle_updated_at'
  ) THEN
    ALTER FUNCTION public.handle_updated_at() SET search_path = '';
    RAISE NOTICE 'Updated search_path for handle_updated_at';
  END IF;
END $$;

-- Verification: List all public functions and their search_path settings
SELECT 
  n.nspname as schema,
  p.proname as function_name,
  pg_get_function_identity_arguments(p.oid) as arguments,
  COALESCE(
    (SELECT setting 
     FROM unnest(p.proconfig) as setting 
     WHERE setting LIKE 'search_path=%'
    ),
    'not set (mutable)'
  ) as search_path_setting
FROM pg_proc p
JOIN pg_namespace n ON p.pronamespace = n.oid
WHERE n.nspname = 'public'
  AND p.proname IN (
    'handle_new_user',
    'update_adventure_rating', 
    'update_updated_at_column',
    'is_tradable_token',
    'execute_trade',
    'handle_updated_at'
  )
ORDER BY p.proname;
