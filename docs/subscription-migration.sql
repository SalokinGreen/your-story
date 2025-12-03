-- Subscription System Migration
-- Run this in your Supabase SQL Editor

-- ============================================
-- SUBSCRIPTION TIERS ENUM
-- ============================================

-- Create enum for subscription tiers
DO $$ BEGIN
    CREATE TYPE subscription_tier AS ENUM ('free', 'starter', 'pro', 'premium');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

-- Create enum for subscription status
DO $$ BEGIN
    CREATE TYPE subscription_status AS ENUM ('active', 'canceled', 'past_due', 'trialing', 'incomplete');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

-- ============================================
-- USER SUBSCRIPTIONS TABLE
-- ============================================

CREATE TABLE IF NOT EXISTS public.user_subscriptions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    
    -- Subscription tier and status
    tier subscription_tier NOT NULL DEFAULT 'free',
    status subscription_status NOT NULL DEFAULT 'active',
    
    -- Stripe integration
    stripe_customer_id TEXT,
    stripe_subscription_id TEXT,
    stripe_price_id TEXT,
    
    -- Billing period
    current_period_start TIMESTAMPTZ,
    current_period_end TIMESTAMPTZ,
    cancel_at_period_end BOOLEAN DEFAULT false,
    
    -- Weekly coin system
    weekly_coin_allowance INTEGER NOT NULL DEFAULT 100, -- Free tier default
    coins_last_refill TIMESTAMPTZ DEFAULT NOW(),
    coins_this_week INTEGER NOT NULL DEFAULT 0, -- Track how many coins given this week
    
    -- Metadata
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    
    -- Ensure one subscription per user
    CONSTRAINT unique_user_subscription UNIQUE (user_id)
);

-- Add indexes for better query performance
CREATE INDEX IF NOT EXISTS idx_subscriptions_user ON public.user_subscriptions(user_id);
CREATE INDEX IF NOT EXISTS idx_subscriptions_stripe_customer ON public.user_subscriptions(stripe_customer_id);
CREATE INDEX IF NOT EXISTS idx_subscriptions_stripe_subscription ON public.user_subscriptions(stripe_subscription_id);
CREATE INDEX IF NOT EXISTS idx_subscriptions_tier ON public.user_subscriptions(tier);
CREATE INDEX IF NOT EXISTS idx_subscriptions_status ON public.user_subscriptions(status);
CREATE INDEX IF NOT EXISTS idx_subscriptions_refill ON public.user_subscriptions(coins_last_refill);

-- Enable Row Level Security
ALTER TABLE public.user_subscriptions ENABLE ROW LEVEL SECURITY;

-- ============================================
-- RLS POLICIES
-- ============================================

-- Users can view their own subscription
CREATE POLICY "Users can view own subscription" ON public.user_subscriptions
    FOR SELECT USING (auth.uid() = user_id);

-- Only service role can insert/update/delete (via API routes)
-- Users cannot directly modify their subscription
CREATE POLICY "Service role can manage subscriptions" ON public.user_subscriptions
    FOR ALL USING (auth.role() = 'service_role');

-- ============================================
-- TRIGGERS
-- ============================================

-- Trigger to update updated_at on changes
CREATE TRIGGER update_subscriptions_updated_at 
    BEFORE UPDATE ON public.user_subscriptions
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ============================================
-- HELPER FUNCTIONS
-- ============================================

-- Function to get subscription tier for a user (returns 'free' if no subscription exists)
CREATE OR REPLACE FUNCTION get_user_subscription_tier(p_user_id UUID)
RETURNS subscription_tier
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_tier subscription_tier;
BEGIN
    SELECT tier INTO v_tier
    FROM public.user_subscriptions
    WHERE user_id = p_user_id
    AND status = 'active';
    
    -- Return 'free' if no active subscription found
    RETURN COALESCE(v_tier, 'free');
END;
$$;

-- Function to check if user has BYOK access (any paid tier)
CREATE OR REPLACE FUNCTION has_byok_access(p_user_id UUID)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_tier subscription_tier;
BEGIN
    v_tier := get_user_subscription_tier(p_user_id);
    RETURN v_tier IN ('starter', 'pro', 'premium');
END;
$$;

-- Function to get weekly coin allowance for a tier
CREATE OR REPLACE FUNCTION get_tier_weekly_coins(p_tier subscription_tier)
RETURNS INTEGER
LANGUAGE plpgsql
IMMUTABLE
AS $$
BEGIN
    RETURN CASE p_tier
        WHEN 'free' THEN 100
        WHEN 'starter' THEN 700
        WHEN 'pro' THEN 1200
        WHEN 'premium' THEN 2800
        ELSE 100
    END;
END;
$$;

-- Function to check if weekly refill is due (7 days since last refill)
CREATE OR REPLACE FUNCTION needs_weekly_refill(p_user_id UUID)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_last_refill TIMESTAMPTZ;
BEGIN
    SELECT coins_last_refill INTO v_last_refill
    FROM public.user_subscriptions
    WHERE user_id = p_user_id;
    
    -- If no subscription record, needs setup (will be created on first check)
    IF v_last_refill IS NULL THEN
        RETURN true;
    END IF;
    
    -- Check if 7 days have passed
    RETURN v_last_refill <= NOW() - INTERVAL '7 days';
END;
$$;

-- Function to perform weekly coin refill for a user
-- Returns the number of coins added
CREATE OR REPLACE FUNCTION refill_weekly_coins(p_user_id UUID)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_tier subscription_tier;
    v_allowance INTEGER;
    v_sub_exists BOOLEAN;
BEGIN
    -- Check if subscription record exists
    SELECT EXISTS(
        SELECT 1 FROM public.user_subscriptions WHERE user_id = p_user_id
    ) INTO v_sub_exists;
    
    -- If no subscription, create free tier subscription
    IF NOT v_sub_exists THEN
        INSERT INTO public.user_subscriptions (user_id, tier, status, weekly_coin_allowance, coins_last_refill, coins_this_week)
        VALUES (p_user_id, 'free', 'active', 100, NOW(), 100);
        RETURN 100;
    END IF;
    
    -- Get current tier and calculate allowance
    SELECT tier INTO v_tier
    FROM public.user_subscriptions
    WHERE user_id = p_user_id;
    
    v_allowance := get_tier_weekly_coins(v_tier);
    
    -- Update refill timestamp and coins
    UPDATE public.user_subscriptions
    SET coins_last_refill = NOW(),
        coins_this_week = v_allowance,
        weekly_coin_allowance = v_allowance,
        updated_at = NOW()
    WHERE user_id = p_user_id;
    
    RETURN v_allowance;
END;
$$;

-- Function to ensure user has subscription record (creates free tier if not exists)
CREATE OR REPLACE FUNCTION ensure_user_subscription(p_user_id UUID)
RETURNS public.user_subscriptions
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_subscription public.user_subscriptions;
BEGIN
    -- Try to get existing subscription
    SELECT * INTO v_subscription
    FROM public.user_subscriptions
    WHERE user_id = p_user_id;
    
    -- If not found, create free tier
    IF v_subscription IS NULL THEN
        INSERT INTO public.user_subscriptions (
            user_id, 
            tier, 
            status, 
            weekly_coin_allowance, 
            coins_last_refill, 
            coins_this_week
        )
        VALUES (
            p_user_id, 
            'free', 
            'active', 
            100, 
            NOW(), 
            100
        )
        RETURNING * INTO v_subscription;
    END IF;
    
    RETURN v_subscription;
END;
$$;

-- ============================================
-- SUBSCRIPTION TIER CONFIGURATION VIEW
-- ============================================

-- Create a view for subscription tier info (useful for frontend)
CREATE OR REPLACE VIEW public.subscription_tiers AS
SELECT 
    'free'::subscription_tier as tier,
    'Free' as name,
    0 as price_monthly,
    100 as weekly_coins,
    false as byok_access,
    'Try out the platform with limited coins' as description
UNION ALL
SELECT 
    'starter'::subscription_tier,
    'Starter',
    10,
    700,
    true,
    'BYOK access + 700 weekly coins'
UNION ALL
SELECT 
    'pro'::subscription_tier,
    'Pro',
    15,
    1200,
    true,
    'BYOK access + 1200 weekly coins'
UNION ALL
SELECT 
    'premium'::subscription_tier,
    'Premium',
    30,
    2800,
    true,
    'BYOK access + 2800 weekly coins';

-- ============================================
-- GRANT PERMISSIONS
-- ============================================

-- Allow authenticated users to read subscription tiers view
GRANT SELECT ON public.subscription_tiers TO authenticated;

-- Allow service role full access to subscriptions
GRANT ALL ON public.user_subscriptions TO service_role;

-- Allow authenticated users to read their own subscription
GRANT SELECT ON public.user_subscriptions TO authenticated;

-- ============================================
-- COMMENTS
-- ============================================

COMMENT ON TABLE public.user_subscriptions IS 'User subscription records with Stripe integration and weekly coin tracking';
COMMENT ON COLUMN public.user_subscriptions.tier IS 'Subscription tier: free, starter ($10), pro ($15), premium ($30)';
COMMENT ON COLUMN public.user_subscriptions.weekly_coin_allowance IS 'Coins given per week based on tier';
COMMENT ON COLUMN public.user_subscriptions.coins_last_refill IS 'Timestamp of last weekly coin refill';
COMMENT ON COLUMN public.user_subscriptions.coins_this_week IS 'Coins already given this week';
COMMENT ON FUNCTION refill_weekly_coins IS 'Performs weekly coin refill for a user, returns coins added';
COMMENT ON FUNCTION has_byok_access IS 'Check if user has BYOK (Bring Your Own Key) access based on subscription tier';
