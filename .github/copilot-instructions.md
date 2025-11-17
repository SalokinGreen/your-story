# Copilot instructions for this repo (your-story)

This project is a Next.js 16 app-router project written in TypeScript using React 19 and Tailwind CSS v4. It renders an interactive, choice-driven story from strongly-typed data models. A DeepSeek-powered API route generates story continuations on-demand.

## Architecture and data flow

### Core Pages

- app/page.tsx: Landing page with auth form/user profile display.
- app/story/page.tsx: Story shell. Loads StoryData from database or starter stories, manages story state, renders <Story />. Includes handleCustomInput for free-form text submission.
- app/story/story.tsx: Presentational story component. Receives full StoryData via spread props, renders scenes with choices. Includes custom input toggle, retry button, and momentum mode selection.
- app/story/stats.tsx: Stats display component showing character stats, resources, inventory, achievements.
- app/story/lore.tsx: Lore display component, filters by `on` state (only shows active lore).
- app/story/menu.tsx: In-game editor for story state (stats, resources, inventory, achievements, lore, plot beats). Feature parity with creator for all systems.
- app/story/upgrades.tsx: Character upgrade shop for spending progression points.
- app/library/page.tsx: Library page showing user's stories and adventures with authenticated fetch.
- app/creator/page.tsx: Adventure creation interface with full editing capabilities for all story elements.
- app/profile/[userId]/page.tsx: User profile page with token balance, adventures, public stories, and admin controls (always at bottom).

### Data Models

- app/misc/structs.ts: Canonical TypeScript interfaces (StoryData, Scene, ScenePart, Chapter, Stat, Resource, InventoryItem, Achievement, StoryLore, Choices, Adventure, Story, etc.). Single source of truth for shapes.
  - **Achievement**: Includes optional `ai_hint` field for precise AI triggering conditions separate from user-facing descriptions.
  - **InventoryItem**: Strict type union 'normal' | 'consumable' | 'story' | 'misc' with specific behaviors per type.
  - **StoryLore**: Includes `on` (boolean), `on_triggers` (string[]), `off_triggers` (string[]), `beats_trigger` (number[]), `beats_untrigger` (number[]) for dynamic visibility.
- app/misc/starter_stories.ts: Example datasets for testing and development.

### Auth & Tokens

- app/misc/auth.ts: Supabase Auth helper functions (signUp, signIn, signOut, getCurrentUser, getSession, isAdmin).
- app/misc/AuthContext.tsx: Client-side React context providing auth state (user, loading) and methods via useAuth() hook.
- app/misc/supabase.ts: Supabase client instance with persistSession, autoRefreshToken, detectSessionInUrl enabled; localStorage storage.
- app/misc/tokens.ts: Token operations (getUserTokenBalance, hasEnoughTokens, deductTokens, giftTokens, mintTokens). Uses aggregate counts to bypass Supabase 1000-row cap.
- app/misc/getAuthToken.ts: getAuthToken() and authenticatedFetch() helpers for API calls with Authorization headers.
- app/misc/NotificationContext.tsx: Toast notification context for user feedback.

### AI Integration

- app/misc/ai.ts: AI prompt builder and response parser. buildMessages constructs chat history; outputToScenePart parses LLM output (XML tags: <story>, <memory>, <choices>, <commands>).
  - **Lore filtering**: Only sends lore entries where `on !== false` to AI.
  - **Achievement display**: Shows only locked achievements using `ai_hint || description` for precise triggering.
  - **Robust parsing**: Handles responses with or without `<story>` tags via fallback extraction logic.
  - **Item types**: Provides AI with type-specific behavior descriptions (normal, consumable, story, misc).
- app/api/story/next/route.ts: POST endpoint calling DeepSeek Chat Completions API; deducts tokens via service role; returns { part: ScenePart, meta: { model, usage, balance } }.

### API Routes

#### Auth

- app/api/auth/signup/route.ts: User registration.
- app/api/auth/signin/route.ts: User login.
- app/api/auth/signout/route.ts: User logout.
- app/api/auth/user/route.ts: GET current authenticated user.

#### Tokens

- app/api/tokens/balance/route.ts: GET token balance using service role for accurate counts (total, tradable, locked).
- app/api/tokens/gift/route.ts: POST to gift tokens between users; requires auth.
- app/api/tokens/mint/route.ts: POST to mint tokens (admin only); uses service role.
- app/api/tokens/remove/route.ts: POST to remove/burn tokens (admin only); uses service role and deductTokens.

#### Content

- app/api/stories/route.ts: GET user stories with RLS; uses NEXT_PUBLIC keys for user context.
- app/api/stories/[id]/route.ts: GET/PATCH/DELETE individual story.
- app/api/adventures/route.ts: GET user adventures.
- app/api/adventures/[id]/route.ts: GET/PATCH/DELETE individual adventure.
- app/api/folders/route.ts: GET user folders.
- app/api/folders/[id]/route.ts: PATCH/DELETE folder.
- app/api/comments/route.ts: GET/POST comments.
- app/api/users/[userId]/route.ts: GET user data.
- app/api/users/[userId]/role/route.ts: PATCH user role (admin only).
- app/api/profiles/[userId]/route.ts: GET/PATCH user profile data.

### Components

- app/components/AuthForm.tsx: Sign up/sign in form.
- app/components/UserProfile.tsx: User profile display with sign out.
- app/components/TokenBalanceDisplay.tsx: Token balance UI (total, tradable, locked).
- app/components/GiftTokenForm.tsx: Gift tokens form (shown on other users' profiles).
- app/components/AdminControls.tsx: Admin-only UI for minting, removing tokens, and changing user roles.
- app/components/EditDisplayName.tsx: Edit display name inline.
- app/components/EditProfile.tsx: Edit profile (bio, location, website, avatar). Avatar uploads use unique timestamped filenames, cache-busting URLs, and proper old file deletion.
- app/components/NotificationContainer.tsx: Toast notifications display.

### Config

- next.config.ts: Default Next config with images.remotePatterns for Supabase storage.

Key pattern: StoryData is spread into the Story component (e.g., <Story {...storyData} />). The component signature is Story(storyData: StoryData), so props are the StoryData fields directly, not nested under a prop name.

## Conventions and expectations

### TypeScript

- Strict mode enabled; keep interfaces in app/misc/structs.ts and reuse across components.
- Path alias @/\* maps to repo root via tsconfig.json. Prefer absolute imports like import { StoryData } from "@/app/misc/structs".
- No any types; explicit typing required.

### Styling

- Tailwind v4 utility-first styling via globals.css.
- Use bg-linear-to-_ for gradients (Tailwind v4 syntax, not bg-gradient-to-_).
- Keep UI minimal and semantic with dark mode support.

### Authentication Patterns

- **User-context API calls**: Use NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_KEY with RLS policies. Pass Authorization: Bearer ${token} header.
- **Admin/service operations**: Use SUPABASE_SERVICE_ROLE_KEY to bypass RLS for admin operations (mint/remove tokens, user management).
- **Client-side auth**: Use useAuth() hook from AuthContext.tsx; supabase client configured with persistSession, autoRefreshToken.
- **API authentication**: Validate Bearer token with supabase.auth.getUser(token); reject 401 if invalid.
- **Helper functions**: Use authenticatedFetch from getAuthToken.ts for client-side API calls.

### Token System

- **Database**: tokens table (id, creator_id, minted_at, metadata_url); token_ownerships table (token_id, owner_id, acquired_at).
- **Tradability**: Tokens are tradable if minted_at >= 1 month ago; locked otherwise.
- **Balance counting**: Use aggregate counts (via head count) to bypass Supabase 1000-row limit; getUserTokenBalance in tokens.ts returns { total, tradable, locked }.
- **Operations**: deductTokens (burn newest first), giftTokens (transfer tradable only), mintTokens (admin only).
- **API balance**: Always use /api/tokens/balance with service role for accurate counts.

### Adventure Visibility System

- **Visibility levels**: Adventures have three visibility settings: 'public' (visible in explorer), 'hidden' (accessible via direct link only), 'private' (only visible to author).
- **Database**: adventures.visibility column with CHECK constraint; RLS policy filters by visibility.
- **API enforcement**: /api/adventures uses service role key to bypass RLS when user is viewing their own adventures; validates ownership for private adventures.
- **Client behavior**: Library shows all user's adventures; Explorer shows only public adventures; Direct links work for hidden/public, blocked for private non-owners.

### UI Patterns

- Mark client components with "use client" only when needed.
- Keep server components for Next 16 app router by default.
- Toast notifications via NotificationContext; use addNotification("message", "success"|"failure"|"warning").
- Profile page: Admin controls must always be at the very bottom (see comment in profile/[userId]/page.tsx).

### DeepSeek API

- app/api/story/next/route.ts accepts { storyData, userChoice? } and returns { part: ScenePart, meta: { model, usage, balance } }.
- Requires DEEPSEEK_API_KEY in env; optional DEEPSEEK_MODEL (default: deepseek-chat).
- Deducts tokens before generation; returns updated balance in response meta.
- **Payload optimization**: Client trims storyData before sending to stay under Vercel's 4.5MB limit. Only sends last 6 scene parts with minimal fields (content, user, role), caps text fields, and strips heavy nested data like choices/commands from history.
- **Creator payload**: Adventure creation logs payload size and warns if >4MB to help creators manage content size.

## Developer workflows

- Dev: npm run dev (Next dev server).
- Build: npm run build; Start: npm run start.
- Lint: npm run lint (eslint-config-next). Prefer fixing with eslint --fix when safe.
- Test: npm run test (Vitest). Unit tests are in tests/. postcss.config.mjs skips plugins during test runs (NODE_ENV=test) to avoid optional dep requirements.
- Node: Use an LTS Node >= 18 compatible with Next 16 and React 19.
- Environment: Create .env.local with:
  - DEEPSEEK_API_KEY=<your_key>
  - NEXT_PUBLIC_SUPABASE_URL=<your_url>
  - NEXT_PUBLIC_SUPABASE_KEY=<your_anon_key>
  - SUPABASE_URL=<your_url> (same as NEXT_PUBLIC)
  - SUPABASE_KEY=<your_anon_key> (same as NEXT_PUBLIC)
  - SUPABASE_SERVICE_ROLE_KEY=<your_service_role_key>
  - Optional: DEEPSEEK_MODEL=deepseek-chat

## Working with story state

- Current state is module-scoped in app/story/page.tsx (StoryState, scene) and managed via useState hooks.
- To advance the story, append a ScenePart to StoryData.scene.parts and render the last part. Use structs.ts types to maintain shape integrity.
- **Lore triggers**: processLoreTriggers function checks trigger words and beat indices to dynamically enable/disable lore entries.
- **Item types**:
  - normal: Advantage on use, breaks on failure
  - consumable: Advantage on use, consumed immediately
  - story: Advantage on use, never breaks/consumed (quest items)
  - misc: Prevents disadvantage, never breaks/consumed
- **Custom input**: handleCustomInput function allows free-form text submission to AI without predefined choices.
- **Retry system**: handleRetry removes last AI response and regenerates with same context.

## Extending the app

- If adding AI generation, prefer app/api/story/\* route handlers or server actions that accept current StoryData and return next ScenePart. Keep prompts/data contracts in a shared module (e.g., app/misc/ai.ts) and type them.
- For multi-page UI (Stats/Inventory/Lore/Achievements/Menu), reuse the StoryState enum in app/story/page.tsx and split each view into small components under app/story/.
- When adding new API routes that interact with user data, follow the authentication pattern:
  - User-context queries: Use NEXT_PUBLIC keys with RLS and validate Bearer tokens.
  - Admin operations: Use SUPABASE_SERVICE_ROLE_KEY to bypass RLS after verifying admin status.

## Examples from repo

- Data model reference: app/misc/structs.ts
- Sample dataset used on the story page: app/misc/starter_stories.ts (goblin_layer)
- Rendering the current scene vs starting_content: app/story/story.tsx
- AI prompt construction and parsing: app/misc/ai.ts (buildMessages, outputToScenePart)
- DeepSeek API integration: app/api/story/next/route.ts
- Token balance with aggregate counts: app/misc/tokens.ts (getUserTokenBalance)
- Authentication patterns: app/misc/getAuthToken.ts (authenticatedFetch)
- Admin controls example: app/components/AdminControls.tsx
- Lore trigger system: app/story/page.tsx (processLoreTriggers)
- Custom input handling: app/story/page.tsx (handleCustomInput)
- Achievement with ai_hint: app/creator/page.tsx and app/story/menu.tsx (achievement editors)

## Guardrails for AI edits

- Do not change interfaces in structs.ts without updating all usages and starter_stories.ts.
- Preserve the StoryData spread prop pattern in Story unless refactoring all call sites.
- Keep new code TypeScript-strict, with explicit types and no any.
- When creating API routes that access user data:
  - Always validate authentication with Bearer tokens for user-context operations.
  - Use service role keys only for admin operations after verifying admin status.
  - Follow RLS patterns: NEXT_PUBLIC keys for user-scoped queries, service role for admin bypasses.
