# Your Story
Your Story is a Next.js 16 + React 19 app for AI-powered, choice-driven storytelling. It now includes a unified Library with search, filter, sort, and folder organization for your stories.

## Features
- **Interactive Storytelling**: Make choices that influence the direction of the story.
- **Dynamic AI Generation**: DeepSeek-powered continuations with a structured parser.
- **Library Management**: Browse stories and adventures with search, filters, and sorting.
- **Folders**: Organize stories into customizable folders (color + icon). Create, edit, delete, and move stories between folders.
- **Authentication**: Supabase auth with a simple profile view.
- **Responsive UI**: Tailwind CSS v4 with a clean, minimal design.

## Data Structure

The data structure for Your Story is designed to efficiently manage story elements, user choices, and game state. Below is an overview of the key components:

### Story Elements
- **Premise**: The central theme or concept of the story.
- **Plot Beats**: Divided sections of the story, each containing multiple scenes.
- **Scenes**: Individual segments within chapters that present narrative content and choices.
- **Choices**: Options presented to the player that influence the story's direction.

### AI Elements
- **LLM Models**: Different language models used for generating story content.
- **Prompts**: Predefined templates used to guide the LLMs in generating relevant content.
- **Responses**: Generated text from the LLMs based on user choices and prompts
- **Context Management**: Mechanism to maintain story context across interactions.
- **Memory**: Storage of previous interactions to enhance continuity in storytelling.
- **Lore Entries**: Background information and world-building details to enrich the story.

### User Data
- **Player Profile**: Information about the player, including preferences and progress.
- **Save States**: Serialized data representing the current state of the game for saving and loading
- **Statistics**: Tracking player choices, achievements, player stats, and story outcomes.
- **Feedback**: User feedback and ratings for stories and gameplay experience.

###

## API and AI

This app now includes a minimal server route that calls DeepSeek's Chat Completions API to generate the next ScenePart for the story.

- API route: `app/api/story/next/route.ts` (POST)
- Request body:
	- `storyData` (StoryData) — current story state
	- `userChoice` (string, optional) — the player's selected choice text
- Response body:
	- `part` (ScenePart) — assistant-generated continuation
	- `meta` — model/usage info from DeepSeek

Folders and Library endpoints:
- `GET/POST /api/folders` — list and create folders (auth required)
- `PATCH/DELETE /api/folders/[id]` — update or delete folder (auth + ownership)
- `PATCH /api/stories/[id]` — move story via `{ folderId: string | null }`

Environment variables (create a `.env.local`):

```
DEEPSEEK_API_KEY=your_api_key_here
# Optional, defaults to deepseek-chat
DEEPSEEK_MODEL=deepseek-chat

# Supabase
SUPABASE_URL=your_supabase_project_url
SUPABASE_KEY=your_supabase_anon_key
NEXT_PUBLIC_SUPABASE_URL=your_supabase_project_url
NEXT_PUBLIC_SUPABASE_KEY=your_supabase_anon_key

Setup note: run `docs/folders-setup.sql` in your Supabase SQL Editor to create `story_folders` and add `stories.folder_id`.
```

Notes:
- The route enforces safe, structured responses (PG-13) and asks DeepSeek to return strict JSON of the shape `{ content: string; imageUrl: string; user: false }`.
- If the model returns plain text, it is wrapped into a `ScenePart` as a fallback.
- Prompt construction lives in `app/misc/ai.ts`.

More docs: see `/docs` for setup, architecture, and mechanics.
