# Your Story
Your Story is an interactive story game inspired by classic text-based adventure games and Choice of Games. It's powered by various LLMs to create a dynamic and engaging storytelling experience.

## Features
- **Interactive Storytelling**: Make choices that influence the direction of the story.
- **Multiple Genres**: Explore stories in fantasy, sci-fi, mystery, romance, and more.
- **Dynamic Content Generation**: Stories are generated on-the-fly using advanced language models.
- **User-Friendly Interface**: Easy-to-navigate interface for an immersive experience.
- **Save and Load**: Save your progress and return to your story anytime.
- **Customizable Characters**: Create and customize your own characters to enhance your story.

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

## LLM backend (DeepSeek)

This app now includes a minimal server route that calls DeepSeek's Chat Completions API to generate the next ScenePart for the story.

- API route: `app/api/story/next/route.ts` (POST)
- Request body:
	- `storyData` (StoryData) — current story state
	- `userChoice` (string, optional) — the player's selected choice text
- Response body:
	- `part` (ScenePart) — assistant-generated continuation
	- `meta` — model/usage info from DeepSeek

Environment variables (create a `.env.local`):

```
DEEPSEEK_API_KEY=your_api_key_here
# Optional, defaults to deepseek-chat
DEEPSEEK_MODEL=deepseek-chat
```

Notes:
- The route enforces safe, structured responses (PG-13) and asks DeepSeek to return strict JSON of the shape `{ content: string; imageUrl: string; user: false }`.
- If the model returns plain text, it is wrapped into a `ScenePart` as a fallback.
- Prompt construction lives in `app/misc/ai.ts`.
