# Copilot instructions for this repo (your-story)

This project is a Next.js 16 app-router project written in TypeScript using React 19 and Tailwind CSS v4. It renders an interactive, choice-driven story from strongly-typed data models. A DeepSeek-powered API route generates story continuations on-demand.

## Architecture and data flow

- app/page.tsx: Landing page with auth form/user profile.
- app/story/page.tsx: Story shell. Picks a StoryData (from app/misc/starter_stories.ts), defines a page-local view state enum, and renders <Story />.
- app/story/story.tsx: Presentational story component. Receives a full StoryData object via spread props and renders the latest ScenePart or starting_content plus a fixed Choices list. Choice handling currently logs to console only.
- app/misc/structs.ts: Canonical TypeScript interfaces (StoryData, Scene, ScenePart, Chapter, Stat, Resource, InventoryItem, Achievement, StoryLore, Choices, etc.). Treat this as the single source of truth for shapes. ScenePart includes optional `choices?: Choice[]` and `memoryEntries?: string[]` fields.
- app/misc/starter_stories.ts: Example datasets (kids_on_machines, goblin_layer). Used by story/page.tsx to feed the UI.
- app/misc/ai.ts: AI prompt builder and response parser. `buildMessages` constructs chat history from StoryData; `outputToScenePart` parses LLM output (XML-like tags: <story>, <memory>, <choices>) into a typed ScenePart.
- app/misc/auth.ts: Supabase Auth helper functions (signUp, signIn, signOut, getCurrentUser, getSession).
- app/misc/AuthContext.tsx: Client-side React context providing auth state (user, loading) and methods across the app.
- app/misc/supabase.ts: Supabase client instance configured with SUPABASE_URL and SUPABASE_KEY.
- app/api/story/next/route.ts: POST endpoint that calls DeepSeek Chat Completions API, returns { part: ScenePart, meta: { model, usage } }.
- app/api/auth/signup/route.ts: POST endpoint for user registration.
- app/api/auth/signin/route.ts: POST endpoint for user login.
- app/api/auth/signout/route.ts: POST endpoint for user logout.
- app/api/auth/user/route.ts: GET endpoint to fetch current authenticated user.
- app/components/AuthForm.tsx: Sign up/sign in form component.
- app/components/UserProfile.tsx: User profile display with sign out button.
- next.config.ts: Default Next config. No custom webpack/routing.

Key pattern: StoryData is spread into the Story component (e.g., <Story {...storyData} />). The component signature is Story(storyData: StoryData), so props are the StoryData fields directly, not nested under a prop name.

## Conventions and expectations

- TypeScript strict mode is enabled; keep interfaces in app/misc/structs.ts and reuse them across components.
- Path alias @/\* maps to repo root via tsconfig.json. Prefer absolute imports like import { StoryData } from "@/app/misc/structs".
- Tailwind utility-first styling via globals.css; keep UI minimal and semantic.
- DeepSeek API: app/api/story/next/route.ts is a POST endpoint that accepts { storyData, userChoice? } and returns { part: ScenePart, meta }. Requires DEEPSEEK_API_KEY in env.
- Supabase: Authentication is handled via app/misc/auth.ts and app/misc/AuthContext.tsx. Use useAuth() hook to access user state and auth methods in client components.
- Keep UI components server-safe for Next 16 app router; mark client components only when needed ("use client").

## Developer workflows

- Dev: npm run dev (Next dev server).
- Build: npm run build; Start: npm run start.
- Lint: npm run lint (eslint-config-next). Prefer fixing with eslint --fix when safe.
- Test: npm run test (Vitest). Unit tests are in tests/. postcss.config.mjs skips plugins during test runs (NODE_ENV=test) to avoid optional dep requirements.
- Node: Use an LTS Node >= 18 compatible with Next 16 and React 19.
- Environment: Create .env.local with DEEPSEEK_API_KEY=<your_key>, SUPABASE_URL=<your_url>, and SUPABASE_KEY=<your_key>. Optional: DEEPSEEK_MODEL=deepseek-chat.

## Working with story state

- Current state is module-scoped in app/story/page.tsx (StoryState, scene) and not reactive. If implementing interactions, convert to React state (useState/useReducer) or a small context provider at app/story/.
- To advance the story, append a ScenePart to StoryData.scene.parts and render the last part. Use structs.ts types to maintain shape integrity.
- Choices are currently hardcoded in app/story/story.tsx; if you generalize, add a choices field to StoryData or derive from Chapters/PlotBeats.

## Extending the app

- If adding AI generation, prefer app/api/story/\* route handlers or server actions that accept current StoryData and return next ScenePart. Keep prompts/data contracts in a shared module (e.g., app/misc/ai.ts) and type them.
- For multi-page UI (Stats/Inventory/Lore/Achievements/Menu), reuse the StoryState enum in app/story/page.tsx and split each view into small components under app/story/.

## Examples from repo

- Data model reference: app/misc/structs.ts
- Sample dataset used on the story page: app/misc/starter_stories.ts (goblin_layer)
- Rendering the current scene vs starting_content: app/story/story.tsx
- AI prompt construction and parsing: app/misc/ai.ts (buildMessages, outputToScenePart)
- DeepSeek API integration: app/api/story/next/route.ts

## Guardrails for AI edits

- Do not change interfaces in structs.ts without updating all usages and starter_stories.ts.
- Preserve the StoryData spread prop pattern in Story unless refactoring all call sites.
- Keep new code TypeScript-strict, with explicit types and no any.
