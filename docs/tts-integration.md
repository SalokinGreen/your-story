# Text-to-Speech (TTS) Integration with DeepInfra

## Overview

The Your Story app features text-to-speech capabilities powered by DeepInfra's TTS models. Users can listen to the generated story content with multiple voice options from two models: **Kokoro** (fast & affordable) and **Orpheus** (premium & expressive).

## Features

✅ **Real-time narration** - Listen to AI-generated story content  
✅ **Two TTS models** - Kokoro ($0.62/1M chars) or Orpheus ($7/1M chars)  
✅ **20+ voice options** - American, British, and multi-language voices  
✅ **Playback controls** - Play, pause, and stop audio  
✅ **Markdown stripping** - Automatically cleans formatting for better speech  
✅ **Chunked generation** - Handles long text with intelligent splitting  
✅ **Responsive UI** - Works on mobile and desktop

## TTS Models

### Kokoro-82M ($0.62 per 1M characters)

Fast, cost-effective TTS with natural voices. Best for everyday use.

### Orpheus 3B ($7.00 per 1M characters)

Premium Llama-based TTS with exceptional clarity, expressiveness, and emotional range. Best for immersive storytelling.

## Available Voices

### Kokoro Voices

| Voice ID      | Name      | Accent          |
| ------------- | --------- | --------------- |
| `af_heart`    | Heart ❤️  | American Female |
| `af_bella`    | Bella 🔥  | American Female |
| `af_nicole`   | Nicole 🎧 | American Female |
| `af_sarah`    | Sarah     | American Female |
| `af_sky`      | Sky       | American Female |
| `am_adam`     | Adam      | American Male   |
| `am_michael`  | Michael   | American Male   |
| `am_fenrir`   | Fenrir    | American Male   |
| `bf_emma`     | Emma      | British Female  |
| `bf_isabella` | Isabella  | British Female  |
| `bm_george`   | George    | British Male    |
| `bm_daniel`   | Daniel    | British Male    |

### Orpheus Voices

| Voice ID | Name | Type   |
| -------- | ---- | ------ |
| `tara`   | Tara | Female |
| `leah`   | Leah | Female |
| `jess`   | Jess | Female |
| `mia`    | Mia  | Female |
| `zoe`    | Zoe  | Female |
| `leo`    | Leo  | Male   |
| `dan`    | Dan  | Male   |
| `zac`    | Zac  | Male   |

## Implementation

### Components

**`app/components/TTSControls.tsx`**

- Main TTS UI component
- Handles voice/model selection, playback, and audio state
- Integrates with NotificationContext for user feedback

**`app/components/APIKeysModal.tsx`**

- Settings UI for TTS configuration
- Model selector (Kokoro/Orpheus)
- Voice dropdown with organized optgroups
- Volume slider and auto-generate toggle

### API Routes

**`app/api/tts/generate/route.ts`**

- POST endpoint to generate speech from text
- Accepts: `text` (string), `voiceId` (string), `model` ("kokoro" | "orpheus")
- Returns WAV audio data
- Automatically chunks long text at sentence boundaries
- Deducts coins based on character count and model

### Pricing

Defined in `app/misc/ai_prices.ts`:

```typescript
export const TTS_MODELS = {
  kokoro: {
    pricePerMillionChars: 0.62, // $0.62 per 1M characters
  },
  orpheus: {
    pricePerMillionChars: 7.0, // $7.00 per 1M characters
  },
};
```

With the 2.5x markup, cost in coins:

- **Kokoro**: ~1.5 coins per 1000 characters
- **Orpheus**: ~17.5 coins per 1000 characters

## Usage

1. Go to **Settings** (gear icon) → **Voice** tab
2. Enable TTS
3. Choose model: Kokoro (fast) or Orpheus (premium)
4. Select a voice from the dropdown
5. Adjust volume as needed
6. Optionally enable auto-generate for automatic narration
7. On story pages, click "TTS" button to generate and play audio

## Configuration

TTS settings are stored in localStorage:

| Key               | Description                   | Default      |
| ----------------- | ----------------------------- | ------------ |
| `ttsEnabled`      | TTS feature toggle            | `true`       |
| `ttsModel`        | Selected model                | `"kokoro"`   |
| `ttsLastVoice`    | Selected voice ID             | `"af_heart"` |
| `ttsVolume`       | Playback volume (0-1)         | `1.0`        |
| `ttsAutoGenerate` | Auto-narrate new content      | `false`      |
| `ttsCustomVoices` | Custom voice IDs (JSON array) | `[]`         |

## Technical Details

### Audio Generation Flow

1. User clicks "TTS" button
2. Component shows loading state
3. POST request sent to `/api/tts/generate` with text, voiceId, model
4. API cleans markdown and splits into chunks (1500-2000 chars)
5. DeepInfra API called for each chunk
6. Audio chunks concatenated (base64 → ArrayBuffer)
7. Coins deducted based on character count
8. WAV audio returned to client
9. Audio played via HTML5 Audio element

### Text Processing

The API automatically:

- Removes markdown symbols (`#`, `*`, `_`, `~`, `` ` ``)
- Converts links `[text](url)` to just `text`
- Removes hidden text (`||spoilers||`)
- Reduces multiple newlines to double newlines
- Removes brackets that may confuse TTS
- Trims whitespace
- Limits to 10,000 characters total

### Chunking Strategy

- **Kokoro**: 1500 character chunks (optimized for speed)
- **Orpheus**: 2000 character chunks (handles longer text better)
- Splits at sentence boundaries when possible
- Falls back to paragraph → newline → space boundaries

## Environment Variables

Required in `.env`:

```bash
DEEPINFRA_API_KEY=your_deepinfra_api_key
```

Note: TTS uses the same DeepInfra API key used for LLM inference.

## Error Handling

- Missing API key → 500 error with notification
- Invalid text → 400 error
- Rate limit → 429 error with retry message
- Auth failure → 401/403 error
- Chunk errors → Continues with remaining chunks (unless first chunk fails)

## Testing

To test TTS:

1. Start dev server: `npm run dev`
2. Navigate to Settings → Voice tab
3. Enable TTS and select model/voice
4. Go to a story and generate content
5. Click "TTS" and verify audio plays
6. Test pause/stop controls
7. Try both Kokoro and Orpheus models
8. Verify coin deduction in header balance

## Credits

- **TTS Provider**: [DeepInfra](https://deepinfra.com)
- **Kokoro Model**: [hexgrad/Kokoro-82M](https://deepinfra.com/hexgrad/Kokoro-82M)
- **Orpheus Model**: [canopylabs/orpheus-3b-0.1-ft](https://deepinfra.com/canopylabs/orpheus-3b-0.1-ft)
- **Integration**: Your Story - Updated December 2025
