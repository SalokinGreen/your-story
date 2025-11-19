# AI Integration

This document explains how Your Story integrates with LLMs (DeepSeek, OpenRouter) to generate interactive narratives.

## Overview

The application uses a stateless API approach where the entire relevant story context is sent to the AI for each generation. The AI returns a structured response containing the narrative, choices, and game state updates.

## Supported Providers

1. **DeepSeek** (Default)
   - Model: `deepseek-chat`
   - Optimized for creative writing and following complex instructions.
   - Cost-effective.

2. **OpenRouter** (Optional)
   - Configurable model (default: `anthropic/claude-3-sonnet`)
   - Allows using other models like Claude 3.5 Sonnet, GPT-4o, etc.
   - Set `OPENROUTER_API_KEY` and `DEFAULT_AI_MODEL` in `.env.local`.

## Prompt Engineering

The system uses a comprehensive system prompt (defined in `app/misc/ai.ts`) that instructs the AI to:
- Act as a narrative engine.
- Output strict XML-like tags.
- Manage game mechanics (skills, resources, items).
- Track plot beats and quests.

### Context Construction

For each request, the following context is built:
1. **System Prompt**: Core instructions and output format.
2. **Story Data**: Current state of the player, stats, inventory, and plot.
3. **Recent History**: The last ~12 scene parts (to maintain continuity while fitting in context window).

### Output Format

The AI is instructed to return content in specific tags:

```xml
<story>
The narrative prose goes here...
</story>

<memory>
- Important event to remember 1
- Important event to remember 2
</memory>

<choices>
- Choice 1 text <use_skill: Stealth (DC 50)>
- Choice 2 text
</choices>

<commands>
/modify_stat: Strength(+5)
/add_item: Potion | Healing | consumable | 1
</commands>
```

## Parsing Logic

The `outputToScenePart` function in `app/misc/ai.ts` parses the raw AI response:
1. **Story**: Extracted from `<story>` tags (or inferred if tags are missing).
2. **Choices**: Parsed from `<choices>` block, including metadata like `<use_skill: ...>`.
3. **Commands**: Extracted from `<commands>` block to update game state.
4. **Memory**: Extracted from `<memory>` to be added to the persistent `storyData.memory`.
5. **Markers**: Detects `!!! END CHAPTER !!!`, `!!! END STORY !!!`, etc.

## Choice Syntax

The AI generates choices with embedded metadata for game mechanics:

```
- Sneak past <use_skill: Stealth (DC 60); use_item: Cloak; item_loss: false>
```

This is parsed into a structured `Choice` object used by the UI to display skill checks and handle interactions.

## Token Usage

- **Generation Cost**: 1 Token per request.
- **Tracking**: Tokens are deducted from the user's balance in the database.
- **Logic**: The system burns the *newest* (locked) tokens first, preserving older *tradable* tokens for the user.

## API Integration

The `/api/story/next` endpoint handles the interaction:
1. Verifies user authentication and token balance.
2. Constructs the prompt using `buildMessages`.
3. Calls the appropriate AI provider (DeepSeek or OpenRouter).
4. Parses the response.
5. Deducts tokens.
6. Returns the parsed `ScenePart` to the client.

### Raw Context Mode

The API supports a `useRawContext` parameter. If true, the AI's *raw* output from previous turns is used in the context history instead of the parsed content. This can help the AI maintain better coherence if the parsing strips out important hidden reasoning or formatting.
