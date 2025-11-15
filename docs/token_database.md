text
# Token Database Schema

**Purpose**: This document describes the database schema for the token trading system in Your Story. Users can mint, buy, and trade tokens, but **tokens can only be traded 1 month after minting**.

**Tech Stack**: Supabase (PostgreSQL), Node.js backend with authentication via Supabase Auth.

---

## Core Principles

- Tokens have a single current owner at any time
- All trades and listings are immutable event records
- Tradability is enforced at the database level via Row Level Security (RLS)
- Use `numeric` for all monetary values (exact precision)
- Use `timestamptz` for all timestamps (timezone-aware)
- All tables use `uuid` primary keys with `gen_random_uuid()`

---

## Tables Overview

### `tokens`
Stores minted tokens. Each token has a creator and mint timestamp used to enforce the 1-month trading rule.

**Columns**:
- `id` (uuid, PK): Unique token identifier
- `minted_at` (timestamptz, NOT NULL): When token was minted. **Critical for tradability checks.**
- `creator_id` (uuid, NOT NULL): User who minted the token (references auth.users)
- `metadata_url` (text): URL to token metadata (image, description, etc.)
- `created_at` (timestamptz, NOT NULL): Record creation timestamp

**Example**:
-- Query tradable tokens (older than 1 month)
SELECT * FROM tokens
WHERE minted_at <= now() - interval '1 month';

text

**RLS Policies**:
- All users can read tokens
- Only authenticated users can mint (insert)

---

### `token_ownerships`
Current ownership state. **One row per token** (unique constraint on `token_id`).

**Columns**:
- `token_id` (uuid, PK): References `tokens.id` (CASCADE delete)
- `owner_id` (uuid, NOT NULL): Current owner (references auth.users)
- `acquired_at` (timestamptz, NOT NULL): When user acquired the token
- `updated_at` (timestamptz, NOT NULL): Last ownership change

**Key Constraint**: 
- `PRIMARY KEY (token_id)` ensures single owner per token

**RLS Policies**:
- Users can only SELECT their own ownerships (`owner_id = auth.uid()`)
- Only the `execute_trade` function can UPDATE/INSERT (via SECURITY DEFINER)

**Pattern**: Never update ownership directly. Use the `execute_trade()` function.

---

### `listings`
Active and historical token listings for sale.

**Columns**:
- `id` (uuid, PK): Unique listing identifier
- `token_id` (uuid, NOT NULL): References `tokens.id` (CASCADE delete)
- `seller_id` (uuid, NOT NULL): User listing the token (references auth.users)
- `price` (numeric(20,8), NOT NULL): Listing price (use numeric for exact values)
- `currency` (text, NOT NULL): Currency code (default 'USD')
- `status` (text, NOT NULL): One of `'active'`, `'filled'`, `'canceled'`
- `created_at` (timestamptz, NOT NULL): Listing creation timestamp

**Key Constraint**:
- `UNIQUE (token_id) WHERE (status = 'active')` — only one active listing per token

**RLS Policies**:
- INSERT: Seller must own the token AND token must be tradable (>= 1 month old)
- UPDATE: Only seller can update their own listings
- SELECT: All authenticated users can view listings

**Tradability Check (enforced via RLS)**:
-- Policy blocks INSERT unless this is true:
EXISTS (
SELECT 1 FROM tokens t
WHERE t.id = token_id
AND t.minted_at <= now() - interval '1 month'
)

text

---

### `trades`
Immutable record of completed trades. Created by `execute_trade()` function.

**Columns**:
- `id` (uuid, PK): Unique trade identifier
- `token_id` (uuid, NOT NULL): References `tokens.id` (CASCADE delete)
- `seller_id` (uuid, NOT NULL): Previous owner (references auth.users)
- `buyer_id` (uuid, NOT NULL): New owner (references auth.users)
- `price` (numeric(20,8), NOT NULL): Final trade price
- `currency` (text, NOT NULL): Currency code (default 'USD')
- `executed_at` (timestamptz, NOT NULL): Trade execution timestamp

**RLS Policies**:
- INSERT: Only via `execute_trade()` function (token must be >= 1 month old)
- SELECT: Buyers and sellers can view their own trades

**Pattern**: Never insert trades directly. Always call `execute_trade(listing_id, buyer_id)`.

---

## Helper Functions

### `is_tradable_token(tid uuid) → boolean`
Checks if a token is old enough to trade (>= 1 month since minting).

**Usage in policies**:
-- In RLS policy WITH CHECK clause:
WITH CHECK (is_tradable_token(token_id))

text

**Implementation**:
CREATE FUNCTION is_tradable_token(tid uuid)
RETURNS boolean LANGUAGE sql STABLE AS $$
SELECT minted_at <= now() - interval '1 month'
FROM tokens WHERE id = tid

``` --- ### `execute_trade(p_listing_id uuid, p_buyer_id uuid) → uuid` **Atomic trade execution function.** SECURITY DEFINER — bypasses RLS to perform multi-step transaction. **What it does**: 1. Locks the listing and verifies it's active 2. Checks token is >= 1 month old (tradability rule) 3. Verifies seller still owns the token 4. Inserts trade record into `trades` 5. Updates ownership in `token_ownerships` 6. Marks listing as 'filled' 7. Returns the new trade ID **Usage from Node.js**: ``` const { data, error } = await supabase.rpc('execute_trade', { p_listing_id: 'listing-uuid', p_buyer_id: 'buyer-uuid' }); ``` **Error cases**: - `'Listing not found or not active'` - `'Token not tradable yet'` (< 1 month old) - `'Seller no longer owns token'` --- ## Database Rules & Patterns ### Tradability Enforcement - **Rule**: Tokens can only be listed/traded 1 month after `minted_at` - **Implementation**: PostgreSQL interval check `minted_at <= now() - interval '1 month'` - **Where enforced**: - RLS policies on `listings` (INSERT) - RLS policies on `trades` (INSERT) - `execute_trade()` function (runtime check) **Why not a generated column?** PostgreSQL generated columns require immutable expressions. `now()` is not immutable, so computed tradability must be checked at query time. [web:21] ### Use `numeric` for Money Store all prices as `numeric(20,8)` for exact precision. Never use `float` or `double precision` for monetary values. **Example**: ``` -- ✅ Correct price numeric(20,8) NOT NULL -- ❌ Incorrect price float NOT NULL ``` ### Atomic Ownership Transfers Always use `execute_trade()` to transfer ownership. This prevents race conditions where: - Two buyers try to purchase the same listing - A seller cancels a listing while a trade executes - Ownership state becomes inconsistent with trade records **Pattern**: ``` // ✅ Correct - atomic await supabase.rpc('execute_trade', { p_listing_id, p_buyer_id }); // ❌ Incorrect - race conditions await supabase.from('trades').insert({ ... }); await supabase.from('token_ownerships').update({ ... }); ``` ### Use `timestamptz` for All Timestamps Always use `timestamptz` (timestamp with timezone) for proper global time handling. ``` -- ✅ Correct minted_at timestamptz NOT NULL DEFAULT now() -- ❌ Incorrect minted_at timestamp NOT NULL DEFAULT now() ``` --- ## Common Queries ### Get All Tradable Tokens ``` SELECT t.*, o.owner_id FROM tokens t JOIN token_ownerships o ON o.token_id = t.id WHERE t.minted_at <= now() - interval '1 month'; ``` ### Get User's Active Listings ``` SELECT l.*, t.metadata_url FROM listings l JOIN tokens t ON t.id = l.token_id WHERE l.seller_id = auth.uid() AND l.status = 'active'; ``` ### Get User's Trade History ``` SELECT t.*, tk.metadata_url FROM trades t JOIN tokens tk ON tk.id = t.token_id WHERE t.buyer_id = auth.uid() OR t.seller_id = auth.uid() ORDER BY t.executed_at DESC; ``` ### Check When Token Becomes Tradable ``` SELECT id, minted_at, minted_at + interval '1 month' as tradable_at, CASE WHEN minted_at <= now() - interval '1 month' THEN 'tradable' ELSE 'locked' END as status FROM tokens; ``` --- ## Node.js Integration Examples ### Mint a Token (Creates Non-Tradable Token) ``` const { data: token, error } = await supabase .from('tokens') .insert({ creator_id: userId, metadata_url: imageUrl }) .select() .single(); // Also create ownership record await supabase.from('token_ownerships').insert({ token_id: token.id, owner_id: userId }); ``` ### Create a Listing (Only for Tradable Tokens) ``` // RLS will block this if token < 1 month old const { data, error } = await supabase .from('listings') .insert({ token_id: tokenId, seller_id: userId, price: '99.99', currency: 'USD', status: 'active' }); if (error?.message.includes('tradable')) { console.error('Token not tradable yet!'); } ``` ### Execute a Trade ``` const { data: tradeId, error } = await supabase.rpc('execute_trade', { p_listing_id: listingId, p_buyer_id: buyerId }); if (error) { if (error.message.includes('not tradable yet')) { // Token < 1 month old } else if (error.message.includes('not found')) { // Listing already filled/canceled } } ``` --- ## Testing Checklist - [ ] Cannot create listing for token < 1 month old - [ ] Cannot execute trade for token < 1 month old - [ ] Can create listing exactly 1 month after minting - [ ] Trade updates ownership atomically - [ ] Trade marks listing as 'filled' - [ ] Only one active listing per token at a time - [ ] Seller cannot list token they don't own - [ ] RLS prevents users from viewing other users' ownerships --- ## Migration Notes If migrating from an older schema: 1. Add `minted_at` column to existing tokens (backfill with `created_at`) 2. Create `is_tradable_token()` function before enabling RLS policies 3. Enable RLS policies one table at a time, starting with `tokens` 4. Test `execute_trade()` function in staging before production --- ## References - Supabase RLS: https://supabase.com/docs/guides/auth/row-level-security - PostgreSQL Intervals: https://www.postgresql.org/docs/current/functions-datetime.html - Numeric Types: https://www.postgresql.org/docs/current/datatype-numeric.html ``` This documentation follows Copilot best practices with clear section headings, active voice directives, code examples, and explicit patterns to follow or avoid.[2][3][1]