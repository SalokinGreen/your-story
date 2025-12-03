# AI Integration

This document explains how Your Story integrates with LLMs (DeepSeek, OpenRouter) to generate interactive narratives.

## Overview

The application uses a stateless API approach where the entire relevant story context is sent to the AI for each generation. The AI returns a structured response containing the narrative, choices, and game state updates.

## Generation Modes

### Standard Generation (`/api/story/next`)

Single-stage generation where the AI produces story text, choices, and commands in one call. Faster and more cost-effective.

### Staged Generation (`/api/story/next-staged`)

Three-stage generation for higher quality output:

1. **Stage 1**: Story narration (plain text)
2. **Stage 2a**: Tool calls for game state updates (native OpenAI tool calling)
3. **Stage 2b**: Player choices (plain text list)

Each stage can use a different AI model, allowing optimization for quality, speed, or cost per stage. Costs approximately 2x compared to standard generation.

## Supported Providers

1. **DeepSeek** (Default)

   - Model: `deepseek-chat`
   - Optimized for creative writing and following complex instructions.
   - Cost-effective.

2. **OpenRouter** (Optional)
   - Multiple models available (see AI_MODELS in `app/misc/ai_prices.ts`)
   - Includes: Grok Beta, Claude 3.5 Sonnet, Gemini Pro, GPT-4o, and more
   - Set `OPENROUTER_API_KEY` in `.env.local`.

## Prompt Engineering

### Standard Mode (`ai.ts`)

The system uses a comprehensive system prompt that instructs the AI to:

- Act as a narrative engine.
- Output strict XML-like tags.
- Manage game mechanics (skills, resources, items).
- Track quests and story progression.

### Staged Mode (`ai_staged.ts`)

Uses specialized prompts for each stage:

- **Story Prompt**: Focuses purely on narrative quality without XML wrappers
- **Tool Prompt**: Uses native OpenAI tool calling for precise game state updates
- **Choices Prompt**: Generates contextually appropriate player choices with metadata

### Context Construction

For each request, the following context is built:

1. **System Prompt**: Core instructions and output format.
2. **Story Data**: Current state of the player, stats, inventory, and plot.
3. **Recent History**: Last ~6 scene parts, allocated as 75% of available context (after reserving output tokens), with 25% reserved for memory.

### Context Allocation

Staged mode calculates available context as:

- `availableInputTokens = maxTokens - maxOutputTokens`
- History: 75% of available tokens
- Memory: 25% of available tokens

This ensures the AI has sufficient output space while maximizing relevant context.

### Output Format (Standard Mode)

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

### Output Format (Staged Mode)

Each stage has a different format:

**Stage 1 (Story)**: Plain text narrative without XML wrappers

```
The shadows deepen as you approach the ancient door...
```

**Stage 2a (Tools)**: Native OpenAI tool calling format

```json
{
  "tool_calls": [
    {
      "function": {
        "name": "modify_stat",
        "arguments": "{\"stat_name\":\"Strength\",\"change\":5}"
      }
    }
  ]
}
```

**Stage 2b (Choices)**: Plain text list

```
- Sneak past the guards <use_skill: Stealth (DC 60)>
- Negotiate with the captain <use_skill: Persuasion (DC 45)>
- Fight your way through
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

- **Standard Generation**: ~1 Token per request (based on actual usage and model pricing).
- **Staged Generation**: ~2x tokens (3 separate API calls).
- **TTS Generation**: 3 Tokens per audio generation.
- **Tracking**: Tokens are deducted from the user's balance in the database.
- **Logic**: The system burns the _newest_ (locked) tokens first, preserving older _tradable_ tokens for the user.

## API Integration

### Standard Generation (`/api/story/next`)

1. Verifies user authentication and token balance.
2. Constructs the prompt using `buildMessages`.
3. Calls the appropriate AI provider (DeepSeek or OpenRouter).
4. Parses the response using `outputToScenePart`.
5. Deducts tokens based on actual usage.
6. Returns the parsed `ScenePart` to the client.

### Staged Generation (`/api/story/next-staged`)

1. Verifies authentication and token balance.
2. **Stage 1**: Calls `buildStoryPrompt` and generates narrative.
3. **Stage 2**: Parallel execution:
   - **2a**: Calls `buildToolPrompt` with tool schemas for game state updates.
   - **2b**: Calls `buildChoicesPrompt` for player options.
4. Executes tool calls using `executeTools` from `toolExecutor.ts`.
5. Parses choices and constructs final `ScenePart`.
6. Deducts tokens (sum of all 3 stages).
7. Returns response with `stageBreakdown` and `models` metadata.

### Multi-Model Support

Both endpoints accept model parameters:

- **Standard**: `model` parameter (single model for entire generation)
- **Staged**: `modelStory`, `modelTools`, `modelChoices` (one per stage)

Empty parameters default to the main model (`DEFAULT_AI_MODEL` env var or user's selected model).

### Raw Context Mode

The API supports a `useRawContext` parameter. If true, the AI's _raw_ output from previous turns is used in the context history instead of the parsed content. This can help the AI maintain better coherence if the parsing strips out important hidden reasoning or formatting.
