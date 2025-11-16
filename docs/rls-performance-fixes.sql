-- RLS Performance Fixes: wrap auth.* and current_setting calls with SELECT
-- Safe: guarded by existence checks; only updates policies that exist
-- Reference: https://supabase.com/docs/guides/database/postgres/row-level-security#call-functions-with-select

-- Helper: show current policies (run separately before/after to verify)
-- select schemaname, tablename, policyname, roles, cmd, permissive, qual, with_check
-- from pg_policies
-- where schemaname='public'
--   and tablename in (
--     'tokens','token_ownerships','listings','profiles','adventures',
--     'comments','stories','story_folders'
--   )
-- order by tablename, cmd, policyname;

------------------------------
-- token_ownerships
------------------------------
-- Merge duplicate SELECT policies into a single one and wrap auth.uid()
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_policies 
    WHERE schemaname='public' AND tablename='token_ownerships' AND policyname='own_ownerships_select'
  ) THEN
    DROP POLICY IF EXISTS own_ownerships_select ON public.token_ownerships;
  END IF;

  IF EXISTS (
    SELECT 1 FROM pg_policies 
    WHERE schemaname='public' AND tablename='token_ownerships' AND policyname='Users can view their own token ownerships'
  ) THEN
    DROP POLICY IF EXISTS "Users can view their own token ownerships" ON public.token_ownerships;
  END IF;

  -- Create a normalized single SELECT policy
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies 
    WHERE schemaname='public' AND tablename='token_ownerships' AND policyname='token_ownerships_select_own'
  ) THEN
    CREATE POLICY token_ownerships_select_own
    ON public.token_ownerships
    AS PERMISSIVE
    FOR SELECT
    TO authenticated
    USING (owner_id = (select auth.uid()));
  END IF;
END $$;

------------------------------
-- listings
------------------------------
-- listings_insert_tradable: seller must be current user and token tradable
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_policies 
    WHERE schemaname='public' AND tablename='listings' AND policyname='listings_insert_tradable'
  ) THEN
    ALTER POLICY listings_insert_tradable
    ON public.listings
    WITH CHECK (
      seller_id = (select auth.uid())
      AND EXISTS (
        SELECT 1 FROM public.tokens t
        WHERE t.id = token_id
          AND t.minted_at <= now() - interval '1 month'
      )
    );
  END IF;
END $$;

-- listings_update_own: only seller updates their own listing
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_policies 
    WHERE schemaname='public' AND tablename='listings' AND policyname='listings_update_own'
  ) THEN
    ALTER POLICY listings_update_own
    ON public.listings
    USING (seller_id = (select auth.uid()))
    WITH CHECK (seller_id = (select auth.uid()));
  END IF;
END $$;

------------------------------
-- tokens
------------------------------
-- Users can view tokens they own (via ownership table)
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_policies 
    WHERE schemaname='public' AND tablename='tokens' AND policyname='Users can view tokens they own'
  ) THEN
    ALTER POLICY "Users can view tokens they own"
    ON public.tokens
    USING (
      EXISTS (
        SELECT 1 FROM public.token_ownerships o
        WHERE o.token_id = id
          AND o.owner_id = (select auth.uid())
      )
    );
  END IF;
END $$;

------------------------------
-- profiles
------------------------------
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_policies 
    WHERE schemaname='public' AND tablename='profiles' AND policyname='Users can insert their own profile'
  ) THEN
    ALTER POLICY "Users can insert their own profile"
    ON public.profiles
    WITH CHECK (id = (select auth.uid()));
  END IF;

  IF EXISTS (
    SELECT 1 FROM pg_policies 
    WHERE schemaname='public' AND tablename='profiles' AND policyname='Users can update their own profile'
  ) THEN
    ALTER POLICY "Users can update their own profile"
    ON public.profiles
    USING (id = (select auth.uid()))
    WITH CHECK (id = (select auth.uid()));
  END IF;
END $$;

------------------------------
-- adventures
------------------------------
-- Viewable by everyone: avoid auth.role() checks; just allow
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_policies 
    WHERE schemaname='public' AND tablename='adventures' AND policyname='Adventures are viewable by everyone'
  ) THEN
    ALTER POLICY "Adventures are viewable by everyone"
    ON public.adventures
    USING (is_published = true OR author_id = (select auth.uid()));
  END IF;

  IF EXISTS (
    SELECT 1 FROM pg_policies 
    WHERE schemaname='public' AND tablename='adventures' AND policyname='Users can create adventures'
  ) THEN
    ALTER POLICY "Users can create adventures"
    ON public.adventures
    WITH CHECK (author_id = (select auth.uid()));
  END IF;

  IF EXISTS (
    SELECT 1 FROM pg_policies 
    WHERE schemaname='public' AND tablename='adventures' AND policyname='Users can update own adventures'
  ) THEN
    ALTER POLICY "Users can update own adventures"
    ON public.adventures
    USING (author_id = (select auth.uid()))
    WITH CHECK (author_id = (select auth.uid()));
  END IF;

  IF EXISTS (
    SELECT 1 FROM pg_policies 
    WHERE schemaname='public' AND tablename='adventures' AND policyname='Users can delete own adventures'
  ) THEN
    ALTER POLICY "Users can delete own adventures"
    ON public.adventures
    USING (author_id = (select auth.uid()));
  END IF;
END $$;

------------------------------
-- comments
------------------------------
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_policies 
    WHERE schemaname='public' AND tablename='comments' AND policyname='Authenticated users can create comments'
  ) THEN
    ALTER POLICY "Authenticated users can create comments"
    ON public.comments
    WITH CHECK (user_id = (select auth.uid()));
  END IF;

  IF EXISTS (
    SELECT 1 FROM pg_policies 
    WHERE schemaname='public' AND tablename='comments' AND policyname='Users can update own comments'
  ) THEN
    ALTER POLICY "Users can update own comments"
    ON public.comments
    USING (user_id = (select auth.uid()))
    WITH CHECK (user_id = (select auth.uid()));
  END IF;

  IF EXISTS (
    SELECT 1 FROM pg_policies 
    WHERE schemaname='public' AND tablename='comments' AND policyname='Users can delete own comments'
  ) THEN
    ALTER POLICY "Users can delete own comments"
    ON public.comments
    USING (user_id = (select auth.uid()));
  END IF;
END $$;

------------------------------
-- stories
------------------------------
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_policies 
    WHERE schemaname='public' AND tablename='stories' AND policyname='Users can view own stories and public stories'
  ) THEN
    ALTER POLICY "Users can view own stories and public stories"
    ON public.stories
    USING (
      is_public = true
      OR user_id = (select auth.uid())
    );
  END IF;

  IF EXISTS (
    SELECT 1 FROM pg_policies 
    WHERE schemaname='public' AND tablename='stories' AND policyname='Users can create stories'
  ) THEN
    ALTER POLICY "Users can create stories"
    ON public.stories
    WITH CHECK (user_id = (select auth.uid()));
  END IF;

  IF EXISTS (
    SELECT 1 FROM pg_policies 
    WHERE schemaname='public' AND tablename='stories' AND policyname='Users can update own stories'
  ) THEN
    ALTER POLICY "Users can update own stories"
    ON public.stories
    USING (user_id = (select auth.uid()))
    WITH CHECK (user_id = (select auth.uid()));
  END IF;

  IF EXISTS (
    SELECT 1 FROM pg_policies 
    WHERE schemaname='public' AND tablename='stories' AND policyname='Users can delete own stories'
  ) THEN
    ALTER POLICY "Users can delete own stories"
    ON public.stories
    USING (user_id = (select auth.uid()));
  END IF;
END $$;

------------------------------
-- story_folders
------------------------------
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_policies 
    WHERE schemaname='public' AND tablename='story_folders' AND policyname='Users can view their own folders'
  ) THEN
    ALTER POLICY "Users can view their own folders"
    ON public.story_folders
    USING (user_id = (select auth.uid()));
  END IF;

  IF EXISTS (
    SELECT 1 FROM pg_policies 
    WHERE schemaname='public' AND tablename='story_folders' AND policyname='Users can insert their own folders'
  ) THEN
    ALTER POLICY "Users can insert their own folders"
    ON public.story_folders
    WITH CHECK (user_id = (select auth.uid()));
  END IF;

  IF EXISTS (
    SELECT 1 FROM pg_policies 
    WHERE schemaname='public' AND tablename='story_folders' AND policyname='Users can update their own folders'
  ) THEN
    ALTER POLICY "Users can update their own folders"
    ON public.story_folders
    USING (user_id = (select auth.uid()))
    WITH CHECK (user_id = (select auth.uid()));
  END IF;

  IF EXISTS (
    SELECT 1 FROM pg_policies 
    WHERE schemaname='public' AND tablename='story_folders' AND policyname='Users can delete their own folders'
  ) THEN
    ALTER POLICY "Users can delete their own folders"
    ON public.story_folders
    USING (user_id = (select auth.uid()));
  END IF;
END $$;

------------------------------
-- OPTIONAL: Replace current_setting() claims usage if present anywhere
-- Example pattern (adjust per your policies):
-- USING ((((select current_setting(''request.jwt.claims'', true))::jsonb ->> ''sub'')::uuid) = owner_id)
-- Prefer: USING (owner_id = (select auth.uid()))
------------------------------

-- Verification: show updated policies
select schemaname, tablename, policyname, roles, cmd, permissive, qual, with_check
from pg_policies
where schemaname='public'
  and tablename in (
    'tokens','token_ownerships','listings','profiles','adventures',
    'comments','stories','story_folders'
  )
order by tablename, cmd, policyname;
