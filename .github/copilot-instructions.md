# Copilot instructions for this repo (your-story)

This project is a Next.js 16 app-router project written in TypeScript using React 19 and Tailwind CSS v4. It renders an interactive, choice-driven story from strongly-typed data models. A DeepSeek-powered API route generates story continuations on-demand.

## Architecture and data flow

### Core Pages

- app/page.tsx: Landing page with auth form/user profile display.
- app/story/page.tsx: Story shell. Loads StoryData from database or starter stories, manages story state, renders <Story />. Includes handleCustomInput for free-form text submission.
  - **Dice System Integration**: Uses checkSuccess() to validate skill checks against system-specific DCs; tracks rollTotal and rollDC for AI context
  - **Choice Details**: Constructs system-appropriate context strings (partial success, tie, explosions, success count) sent to AI in format `[SkillName: result (context)]`
  - **Advantage/Disadvantage**: Tracks sources and net count from items, achievements, story state; applies advantage stacking rules per system
  - **Item/Resource Validation**: Checks item existence, applies advantages, handles consumption/breaking per item type; calculates resource penalties when insufficient
- app/story/story.tsx: Presentational story component. Receives full StoryData via spread props, renders scenes with choices. Includes custom input toggle, retry button, and momentum mode selection.
- app/story/stats.tsx: Stats display component showing character stats, resources, inventory, achievements.
- app/story/lore.tsx: Lore display component, filters by `on` state (only shows active lore).
- app/story/menu.tsx: In-game editor for story state (stats, resources, inventory, achievements, lore, plot beats). Feature parity with creator for all systems. Includes AI Config tab with model selection and TTS settings.
- app/story/upgrades.tsx: Character upgrade shop for spending progression points.
- app/library/page.tsx: Library page showing user's stories and adventures with authenticated fetch.
- app/creator/page.tsx: Adventure creation interface with full editing capabilities for all story elements.
- app/profile/[userId]/page.tsx: User profile page with token balance, adventures, public stories, and admin controls (always at bottom).

### Data Models

- app/misc/structs.ts: Canonical TypeScript interfaces (StoryData, Scene, ScenePart, Chapter, Stat, Resource, InventoryItem, Ability, Achievement, StoryLore, Choices, Adventure, Story, etc.). Single source of truth for shapes.
  - **Achievement**: Includes optional `ai_hint` field for precise AI triggering conditions separate from user-facing descriptions.
  - **InventoryItem**: Strict type union 'normal' | 'consumable' | 'story' | 'misc' with specific behaviors per type. Includes `grade` (ItemGrade) and `durability/maxDurability`.
  - **Ability**: Skills/spells/techniques with `name`, `description`, `grade` (AbilityGrade), `cost` (AbilityCost[]), `cooldown`, `currentCooldown`, `stat` (optional), `symbol`.
  - **AbilityCost**: { type: "resource" | "variable", name: string, amount: number }
  - **AbilityGrade**: "novice" | "apprentice" | "adept" | "expert" | "master" | "legendary"
  - **StoryLore**: Includes `on` (boolean), `on_triggers` (string[]), `off_triggers` (string[]), `beats_trigger` (number[]), `beats_untrigger` (number[]) for dynamic visibility.
  - **ScenePart**: Includes optional `toolCalls` (ToolCall[]) and `toolResponses` (CommandResponse[]) for preserving tool calling conversation history. Also includes `stateChanges` (string[]) for human-readable game state modifications that are sent to the story stage.
  - **CommandResponse**: Includes optional `toolCallId` for linking responses to specific tool calls in conversation history.
  - **Condition**: Afflictions/injuries with tiers I-VI that penalize skill checks. Includes `id`, `name`, `tier` (1-6), `description`, `affects` (array of stat names), `affectsAll` (boolean), `source`, `permanent`, `createdAt`.
  - **GameOver**: State for permanent character death/loss with `reason`, `condition` (optional), `timestamp`.
- app/misc/rpgSystems.ts: RPG system configurations and mechanics. Exports 9 systems (3d6, 1d20, 1d100, percentile, pbta, fate, yze, explosive, narrative) with dice rolling, DC calculation, and success checking. Key exports: getRPGSystem(), rollDice(), checkSuccess(), calculateResourceRequirements(), getConditionPenalty(). Each system has unique mechanics (PbtA partial success, Fate ladder/style, YZE stress/panic, Explosive dice chains) and conditionPenalties configuration.
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
  - **Resource System**: Dynamic DC-based resource requirements - Required: DC÷10 (min 5), Success recovery: DC÷20 (min 1), Failure penalty: DC÷10 (min 5). Insufficient resources apply -DC÷10 dice penalty.
  - **RPG System Context**: Sends rich roll results to AI for narrative calibration:
    - PbtA: `[Technique: partial success (7-9)]` signals AI to add complications/costs
    - Fate: `[Diplomacy: tie (margin 0)]` or `[Combat: success with style (+5)]` for narrative impact
    - Explosive: `[Acrobatics: success (d8 exploded x2)]` shows dramatic lucky moments
    - YZE: `[Mechanics: success (3 successes vs 2)]` calibrates tension and panic context
    - All systems include skill name, result (success/failure/partial/tie/style), and system-specific details
  - **Tool Call History**: Preserves complete conversation history including tool calls and responses:
    - Stores `toolCalls` array and `toolResponses` array in each ScenePart
    - `buildMessages` reconstructs tool_calls in assistant messages and tool role messages with proper tool_call_id linking
    - Enables AI self-reference ("I just gave you that sword") and multi-turn tool interactions
    - Tool responses marked with ✓ (success), ✗ (failure), ⚠ (partial success)
- app/misc/ai_staged.ts: Staged generation prompt builders. Exports buildStoryPrompt(), buildToolPrompt(), buildChoicesPrompt() - each returns specialized prompts without XML wrappers.
  - **Context-aware pruning**: buildStoryPrompt accepts `modelName` parameter and dynamically prunes oldest scene parts to fit 75% of model's context for story history, 25% for info (lore, memory, stats).
  - Returns `{ messages, prunedParts }` where `prunedParts` indicates how many oldest parts were removed.
  - No fixed truncation limits - uses actual model context window from ai_prices.ts.
  - **State Changes in Context**: buildStoryPrompt prepends `stateChanges` from the previous assistant part to the user's choice message, informing the story stage about mechanical game state updates.
- app/misc/toolExecutor.ts: Executes tool calls from AI responses locally on the frontend, mapping AI tool names to XML command format. Modifies storyData directly and returns `{ responses: CommandResponse[], stateChanges: string[] }`. The `stateChanges` array contains human-readable descriptions of game state modifications for tools like stat/resource changes, item updates, conditions, etc.
- app/misc/ai_prices.ts: AI model configuration with provider routing (DeepSeek, OpenRouter, Mistral). Includes getModelConfig() helper for dynamic model selection. Exports AI_MODELS constant with models from multiple providers:
  - **BYOK providers** (user provides API key): OpenRouter, DeepSeek, NovelAI
  - **Coins provider** (server-side key, user pays with coins): Mistral (mistral-small-2506, mistral-medium-2508, codestral-2508)
  - **APIKeysAvailable**: Interface with `coinsEnabled` flag for Mistral models
- app/misc/generation.ts: **Frontend generation orchestrator**. Exports generateStoryTurn() which handles the complete 3-stage generation flow:
  - Stage 1: Calls buildStoryPrompt(), streams story content via /api/generate-stream
  - Stage 2: Calls buildToolPrompt() in a loop, executes tools locally via executeTools(), supports multi-round tool calling
  - Stage 3: Calls buildChoicesPrompt(), parses choice syntax from AI response
  - All context building, prompt construction, and tool execution happens on the frontend
  - Backend is just a thin AI proxy (no storyData parsing or tool execution)
- app/api/generate/route.ts: **Thin AI proxy** (non-streaming). Supports BYOK (OpenRouter/DeepSeek) and Coins (Mistral). Accepts { messages, tools?, model, maxTokens, temperature, openRouterKey?, deepseekKey? }. Validates auth, forwards to AI provider, returns { content, toolCalls?, meta }. Mistral models deduct coins after successful generation.
- app/api/generate-stream/route.ts: **Thin AI proxy** (SSE streaming). Supports BYOK and Coins modes. Streams events: { type: "content", content }, { type: "tool_calls", toolCalls }, { type: "done", meta }. Mistral models check balance before generation and deduct coins after.
- app/api/novelai/generate-stream/route.ts: **NovelAI BYOK proxy** (SSE streaming). Accepts { messages, novelaiKey, maxTokens, temperature }. Converts chat messages to completion prompt, forwards to NovelAI GLM-4-6, streams back. No token deduction (BYOK). Story stage only.
- app/misc/novelai.ts: NovelAI types and utilities. Exports NOVELAI_MODEL ("glm-4-6"), NOVELAI_DEFAULT_PARAMS, convertMessagesToPrompt(), buildNovelAIRequest(), NOVELAI_CONTEXT_SIZE (8192).
- app/api/tts/generate/route.ts: POST endpoint for Speechify text-to-speech generation; supports BYOK via speechifyKey field; deducts tokens only when using server key.
- app/api/stt/transcribe/route.ts: POST endpoint for Voxtral speech-to-text transcription (Mistral API); accepts FormData with audio file; uses server MISTRAL_API_KEY; deducts 2 coins per transcription.
- app/api/settings/api-keys/route.ts: GET/POST/DELETE encrypted API key storage. Uses AES-256-GCM encryption with API_KEY_ENCRYPTION_SECRET env var.
- app/misc/APIKeysContext.tsx: React context for managing API keys. Supports localStorage (default) and optional encrypted server storage. Includes OpenRouter OAuth PKCE flow.
- app/components/APIKeysModal.tsx: Settings modal for API key management with tabs for OpenRouter (OAuth + manual), DeepSeek, NovelAI, Speechify.

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
- app/components/TTSControls.tsx: Text-to-speech controls with voice selection, volume, play/pause/stop, and auto-generation support.
- app/components/CustomVoiceManager.tsx: Manage custom Speechify voice IDs for TTS.
- app/components/DiceVisualizer.tsx: Main dice animation component with 4-phase system (rolling→stopped→calculating→result). Supports all 8 RPG systems with visual feedback for advantage/disadvantage, explosions, stress dice, partial success, and Fate ladder outcomes. Click or keyboard (Enter/Space/Escape) to skip animation.

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
- **Token costs**: Currently reserved for future local model hosting. TTS/STT cost tokens only when using server keys (not BYOK).
- **BYOK (Bring Your Own Key)**: All AI generation now requires user-provided API keys. No token billing for AI generation - users pay providers directly.

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
- **AI Config Menu**: Model selection saved to localStorage as "aiPreset", with presets defined in MODEL_PRESETS. Custom presets allow per-stage model overrides.
- **API Keys Settings**: Users must provide their own API keys via Settings modal (gear icon in header). Supports OpenRouter (OAuth + manual), DeepSeek, NovelAI, Speechify. Keys stored in localStorage (default) or encrypted on server (optional).
- **NovelAI Settings**: BYOK integration for story generation only. Settings saved to localStorage (novelaiEnabled, novelaiKey, novelaiTemperature). When enabled, story stage uses NovelAI GLM-4-6 while tools/choices stages use OpenRouter/DeepSeek.
- **TTS Settings**: All TTS preferences saved to localStorage (ttsEnabled, ttsLastVoice, ttsAutoGenerate, ttsVolume, ttsCustomVoices).
- **STT Settings**: Speech-to-text uses Voxtral (Mistral API) and costs 2 coins per transcription. Settings saved to localStorage (sttEnabled). STTButton in ChoicesModal sends audio to /api/stt/transcribe with auto-stop after 3s silence.
- **Embeddings Settings**: Semantic search settings saved to localStorage (embeddingsEnabled, embeddingThreshold). When enabled, uses Mistral embeddings to find relevant lore/memories. embeddingThreshold (0.1-0.5, default 0.25) controls strictness: lower = more results (relaxed), higher = fewer results (strict). Auto-activates for stories with 30+ lore or 50+ memories. Cost: ~0.5 coins per 100 turns.
- **Hidden Messages**: AI can use ||double pipes|| syntax for hidden text (DM notes). Players can't see hidden text unless "showHiddenMessages" is enabled in localStorage. When revealed, hidden text appears with purple highlighting.

### AI API Patterns

- **Frontend-centric architecture**: All generation logic runs on the frontend via `generateStoryTurn()` from `app/misc/generation.ts`. Backend is a thin AI proxy only.
- **New API endpoints**:
  - `/api/generate` - Non-streaming AI proxy: { messages, tools?, model, maxTokens, temperature } → { content, toolCalls?, meta }
  - `/api/generate-stream` - SSE streaming version: sends events { type: "content/tool_calls/done", ... }
- **Frontend orchestration**: story/page.tsx calls `generateStoryTurn(storyData, userChoice, options, callbacks)` which:
  - Builds prompts using ai_staged.ts functions
  - Streams content via /api/generate-stream
  - Executes tools locally on storyData via toolExecutor.ts
  - Parses choices from AI response
- **Multi-provider support**: Automatically routes to DeepSeek, OpenRouter, or Mistral based on model parameter.
- Requires DEEPSEEK_API_KEY for DeepSeek models, OPENROUTER_API_KEY for OpenRouter models, MISTRAL_API_KEY for Mistral (Coins mode).
- Mistral models (mistral-small-2506, mistral-medium-2508, codestral-2508) use server-side key - users pay with coins.
- Optional: DEFAULT_AI_MODEL, DEEPSEEK_MODEL, NEXT_PUBLIC_SITE_URL environment variables.
- Deducts tokens based on actual usage; returns updated balance in response meta.
- **Context allocation**: Uses (maxTokens - maxOutputTokens) then allocates 75% to history, 25% to memory.
- **Model selection**: Client reads from localStorage "aiPreset" key and MODEL_PRESETS, or custom models from "aiModelStory"/"aiModelTools"/"aiModelChoices".

### Embedding System (Semantic Search)

- **Purpose**: Uses Mistral's mistral-embed model (1024 dimensions, $0.10/M tokens) for semantic search of lore and memories.
- **Database**: `story_embeddings` table with pgvector extension in Supabase (see docs/embeddings-migration.sql).
- **When to use**: Automatically enabled when `options.enableEmbeddings=true` and story has >30 lore entries or >50 memories.
- **API Routes**:
  - `/api/embeddings/generate` - Generate embeddings for texts array
  - `/api/embeddings/search` - Semantic search using pgvector RPC
  - `/api/embeddings/upsert` - Insert/update embedding records
  - `/api/embeddings/cleanup` - Remove orphaned embeddings
- **Client utilities** (`app/misc/embeddings.ts`):
  - `searchRelevantContext(storyId, query, authToken, options)` - Retrieve relevant lore/memories
  - `upsertEmbeddings(storyId, entries, authToken)` - Sync entries to database
  - `syncNewMemories(storyId, memories, existingKeys, authToken)` - Background memory sync
  - `syncLoreEmbeddings(storyId, lore, authToken)` - Full lore sync
  - `buildSearchQuery(userChoice, recentParts)` - Build query from context
- **Integration in generation.ts**:
  - Stage 0 (before story): Retrieves embedding context if enabled and thresholds met
  - Stage 4 (after tools): Background sync of new memories (fire-and-forget)
  - `EmbeddingContext` interface passed to `buildStoryPrompt()` and `buildInfoMessage()`
- **Integration in story/page.tsx**:
  - On story load: Syncs lore embeddings if `embeddingsEnabled=true`, 5+ lore entries, and `loreEmbeddingsDirty !== false`
  - On lore update via menu: Sets `loreEmbeddingsDirty = true`, triggering sync on next render
  - Clears dirty flag after successful sync
- **Dirty flag (`loreEmbeddingsDirty`)**: Tracks when lore content has changed and needs re-embedding
  - Set by: `updateStoryData({ lore })`, AI lore commands (create_lore, lore_update, lore_add_content, lore_replace_content, lore_delete_content)
  - Checked by: useEffect in page.tsx that triggers sync only when dirty
  - Cleared after: Successful embedding sync
- **Cost**: ~$0.00005 per turn (~0.5 coins per 100-turn playthrough). Negligible.
- **Fallback**: If embedding search fails, falls back to trigger-based lore and full memory list.

## Developer workflows

- Dev: npm run dev (Next dev server).
- Build: npm run build; Start: npm run start.
- Lint: npm run lint (eslint-config-next). Prefer fixing with eslint --fix when safe.
- Test: npm run test (Vitest). Unit tests are in tests/. postcss.config.mjs skips plugins during test runs (NODE_ENV=test) to avoid optional dep requirements.
- Node: Use an LTS Node >= 18 compatible with Next 16 and React 19.
- Environment: Create .env.local with:
  - DEEPSEEK_API_KEY=<your_key>
  - OPENROUTER_API_KEY=<your_key>
  - MISTRAL_API_KEY=<your_key> (server-side for Coins mode and STT)
  - SPEECHIFY_API_KEY=<your_key>
  - NEXT_PUBLIC_SUPABASE_URL=<your_url>
  - NEXT_PUBLIC_SUPABASE_KEY=<your_anon_key>
  - SUPABASE_URL=<your_url> (same as NEXT_PUBLIC)
  - SUPABASE_KEY=<your_anon_key> (same as NEXT_PUBLIC)
  - SUPABASE_SERVICE_ROLE_KEY=<your_service_role_key>
  - Optional: DEFAULT_AI_MODEL=Deepseek Chat
  - Optional: DEEPSEEK_MODEL=deepseek-chat
  - Optional: NEXT_PUBLIC_SITE_URL=<your_site_url>

## Working with story state

- Current state is module-scoped in app/story/page.tsx (StoryState, scene) and managed via useState hooks.
- To advance the story, append a ScenePart to StoryData.scene.parts and render the last part. Use structs.ts types to maintain shape integrity.
- **Lore triggers**: processLoreTriggers function checks trigger words and beat indices to dynamically enable/disable lore entries.
- **Item types**:
  - normal: Advantage on use, breaks on failure
  - consumable: Advantage on use, consumed immediately
  - story: Advantage on use, never breaks/consumed (quest items)
  - misc: Prevents disadvantage, never breaks/consumed
- **Item Grades**: common (+0), uncommon (+1), rare (+2), epic (+3), mythic (+5 and infinite durability)
- **Ability System**:
  - Abilities are skills, spells, or techniques with resource/variable costs
  - AbilityGrade: "novice" (+0), "apprentice" (+1), "adept" (+2), "expert" (+3), "master" (+4), "legendary" (+5)
  - AbilityCost: { type: "resource" | "variable", name: string, amount: number }
  - Cooldowns in turns - ability unusable while currentCooldown > 0
  - Can use BOTH an item AND an ability on the same skill check (bonuses stack)
  - Key functions in abilitySystem.ts: canAffordAbility(), deductAbilityCost(), startCooldown(), getAbilityBonus()
  - findAbilityMatch() in fuzzyMatch.ts for name matching
  - AI tools: add_ability, remove_ability, modify_ability, upgrade_ability, reduce_cooldown, refresh_ability
- **Resource System**:
  - Required amount: DC ÷ 10 (minimum 5)
  - Insufficient resource penalty: -DC÷10 to dice roll (minimum -5)
  - Success: Recovers DC ÷ 20 points (minimum 1), capped at max value
  - Failure: Loses DC ÷ 10 points (minimum 5)
  - Players keep skill bonus but dice roll is penalized when under-resourced
- **Condition/Affliction System**:
  - Tiers I-VI with escalating penalties per RPG system
  - Conditions affect specific stats (via `affects` array) or all checks (via `affectsAll`)
  - On skill check: Find highest-tier applicable condition, apply its penalty
  - Penalty types by system:
    - 3d6/1d20/1d100/percentile: Negative modifier to roll
    - PbtA: -1 per tier (tiers 4-5 auto-miss, tier 6 game over)
    - Fate: -1 per tier (tier 5 "taken out", tier 6 game over)
    - YZE: Dice pool reduction (tier 6 game over)
    - Explosive: Die size reduction (tier 5 auto-fail, tier 6 game over)
    - Narrative: No mechanical effect (tier 6 game over only)
  - AI manages conditions via tools: add_condition, upgrade_condition, downgrade_condition, remove_condition
  - Tier 6 = permanent, cannot be downgraded (use remove_condition with force=true for miraculous cures)
  - game_over tool for when tier 6 conditions narratively end the story
- **Custom input**: handleCustomInput function allows free-form text submission to AI without predefined choices.
- **Retry system**: handleRetry removes last AI response and regenerates with same context.
- **TTS Integration**: Auto-generate narration clears old audio on text change, triggers handlePlay after 500ms delay when enabled.

## Extending the app

- If adding AI generation, prefer app/api/story/\* route handlers or server actions that accept current StoryData and return next ScenePart. Keep prompts/data contracts in a shared module (e.g., app/misc/ai.ts) and type them.
- For multi-page UI (Stats/Inventory/Lore/Achievements/Menu), reuse the StoryState enum in app/story/page.tsx and split each view into small components under app/story/.
- When adding new API routes that interact with user data, follow the authentication pattern:
  - User-context queries: Use NEXT_PUBLIC keys with RLS and validate Bearer tokens.
  - Admin operations: Use SUPABASE_SERVICE_ROLE_KEY to bypass RLS after verifying admin status.

## Examples from repo

- Data model reference: app/misc/structs.ts
- Sample dataset used on the story page: app/misc/starter_stories.ts (goblin_layer)
- Rendering the current scene vs intro: app/story/story.tsx
- AI prompt construction and parsing: app/misc/ai.ts (buildMessages, outputToScenePart)
- Tool call history preservation: app/misc/ai.ts (buildMessages reconstructs tool_calls and tool role messages)
- Tool execution and response linking: app/misc/toolExecutor.ts (executeTools populates toolCallId)
- DeepSeek API integration: app/api/story/next/route.ts
- Token balance with aggregate counts: app/misc/tokens.ts (getUserTokenBalance)
- Authentication patterns: app/misc/getAuthToken.ts (authenticatedFetch)
- Admin controls example: app/components/AdminControls.tsx
- Lore trigger system: app/story/page.tsx (processLoreTriggers)
- Custom input handling: app/story/page.tsx (handleCustomInput)
- Achievement with ai_hint: app/creator/page.tsx and app/story/menu.tsx (achievement editors)
- Tool history test suite: tests/ai.toolHistory.test.ts (comprehensive validation of conversation history preservation)

## Guardrails for AI edits

- Do not change interfaces in structs.ts without updating all usages and starter_stories.ts.
- Preserve the StoryData spread prop pattern in Story unless refactoring all call sites.
- Keep new code TypeScript-strict, with explicit types and no any.
- When creating API routes that access user data:
  - Always validate authentication with Bearer tokens for user-context operations.
  - Use service role keys only for admin operations after verifying admin status.
  - Follow RLS patterns: NEXT_PUBLIC keys for user-scoped queries, service role for admin bypasses.

## Workflow requirements

- **Discussion first**: Before making any codebase changes, discuss the approach and create a plan with the user.
- **Explicit confirmation required**: Only proceed with code changes after the user explicitly allows or confirms the proposed plan.
- **No unsolicited edits**: Do not create, modify, or delete files without user approval.
