# Copilot instructions for this repo (your-story)

This project is a Next.js 16 app-router project written in TypeScript using React 19 and Tailwind CSS v4. It renders an interactive, choice-driven story from strongly-typed data models. There is no backend/API yet; all state is in-memory on the client.

## Architecture and data flow

- app/page.tsx: Landing page (static UI).
- app/story/page.tsx: Story shell. Picks a StoryData (from app/misc/starter_stories.ts), defines a page-local view state enum, and renders <Story />.
- app/story/story.tsx: Presentational story component. Receives a full StoryData object via spread props and renders the latest ScenePart or starting_content plus a fixed Choices list. Choice handling currently logs to console only.
- app/misc/structs.ts: Canonical TypeScript interfaces (StoryData, Scene, ScenePart, Chapter, Stat, Resource, InventoryItem, Achievement, StoryLore, Choices, etc.). Treat this as the single source of truth for shapes.
- app/misc/starter_stories.ts: Example datasets (kids_on_machines, goblin_layer). Used by story/page.tsx to feed the UI.
- next.config.ts: Default Next config. No custom webpack/routing.

Key pattern: StoryData is spread into the Story component (e.g., <Story {...storyData} />). The component signature is Story(storyData: StoryData), so props are the StoryData fields directly, not nested under a prop name.

## Conventions and expectations

- TypeScript strict mode is enabled; keep interfaces in app/misc/structs.ts and reuse them across components.
- Path alias @/\* maps to repo root via tsconfig.json. Prefer absolute imports like import { StoryData } from "@/app/misc/structs".
- Tailwind utility-first styling via globals.css; keep UI minimal and semantic.
- No persistence, server routes, or external API calls yet. Any “AI/LLM” mentions in README are aspirational; do not assume a backend.
- Keep UI components server-safe for Next 16 app router; mark client components only when needed ("use client").

## Developer workflows

- Dev: npm run dev (Next dev server).
- Build: npm run build; Start: npm run start.
- Lint: npm run lint (eslint-config-next). Prefer fixing with eslint --fix when safe.
- Node: Use an LTS Node >= 18 compatible with Next 16 and React 19.

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

## Guardrails for AI edits

- Do not change interfaces in structs.ts without updating all usages and starter_stories.ts.
- Preserve the StoryData spread prop pattern in Story unless refactoring all call sites.
- Keep new code TypeScript-strict, with explicit types and no any.
