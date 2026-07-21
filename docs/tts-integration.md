# Text-to-Speech (TTS) Integration

## Overview

The Your Story app features text-to-speech capabilities across four BYOK
providers/models. Users can listen to the generated story content with
multiple voice options from: **Kokoro** (fast & affordable, DeepInfra),
**Orpheus** (premium & expressive, DeepInfra), **Cartesia Sonic-3**
(ultra-low-latency), and **ElevenLabs Flash v2.5** (best-in-class quality).
All four are BYOK - the user supplies their own provider API key in Settings;
there is no server-side "Coins" path for TTS.

## Features

✅ **Real-time narration** - Listen to AI-generated story content  
✅ **Four TTS models across four providers** - pick fast/cheap, premium
DeepInfra, low-latency Cartesia, or best-quality ElevenLabs  
✅ **20+ built-in voice options plus custom voice IDs** - American, British,
multi-language, and provider voice libraries  
✅ **Playback controls** - Play, pause, and stop audio  
✅ **Markdown stripping** - Automatically cleans formatting for better speech  
✅ **Chunked generation** - Handles long text with intelligent splitting  
✅ **Responsive UI** - Works on mobile and desktop

## TTS Models

### Kokoro-82M ($0.62 per 1M characters, DeepInfra)

Fast, cost-effective TTS with natural voices. Best for everyday use.

### Orpheus 3B ($7.00 per 1M characters, DeepInfra)

Premium Llama-based TTS with exceptional clarity, expressiveness, and emotional range. Best for immersive storytelling.

### Cartesia Sonic-3 (Cartesia, ~1 credit/character - plan-dependent)

Purpose-built for low-latency, real-time narration. Requires a Cartesia API
key from [play.cartesia.ai](https://play.cartesia.ai/keys). Voice IDs are
UUIDs from Cartesia's voice library - two samples are bundled, add more via
the custom voice field.

### ElevenLabs Flash v2.5 (ElevenLabs, ~0.5 credits/character - plan-dependent)

Best-in-class expressiveness and emotional range, still low-latency (~75ms).
Requires an ElevenLabs API key from
[elevenlabs.io/app/settings/api-keys](https://elevenlabs.io/app/settings/api-keys).
Voice IDs come from ElevenLabs' voice library - a few premade voices are
bundled, add more via the custom voice field.

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

### Cartesia Voices (bundled samples - full library at play.cartesia.ai)

| Voice ID                              | Name           |
| -------------------------------------- | -------------- |
| `a0e99841-438c-4a64-b679-ae501e7d6091` | Barbershop Man |
| `156fb8d2-335b-4950-9cb3-a2d33befec77` | Helpful Woman  |

### ElevenLabs Voices (bundled samples - full library at elevenlabs.io/app/voice-library)

| Voice ID               | Name           |
| ----------------------- | -------------- |
| `21m00Tcm4TlvDq8ikWAM` | Rachel (Female) |
| `EXAVITQu4vr4xnSDxMaL` | Bella (Female)  |
| `ErXwobaYiN019PkySvjV` | Antoni (Male)   |

For Cartesia and ElevenLabs, any other voice ID from the provider's voice
library can be added via the custom voice field in Settings - both providers
have large libraries that aren't fully enumerable the way Kokoro/Orpheus's
small named voice sets are.

## Implementation

### Components

**`app/components/TTSControls.tsx`**

- Main TTS UI component
- Handles voice/model selection, playback, and audio state
- Picks the matching BYOK key (`deepinfraKey`/`cartesiaKey`/`elevenlabsKey`) for the selected model
- Integrates with NotificationContext for user feedback

**`app/components/APIKeysModal.tsx`**

- Settings UI for TTS configuration and all four provider API keys
- Model selector (Kokoro/Orpheus/Cartesia/ElevenLabs)
- Voice dropdown with organized optgroups, resets to a sensible default voice on model switch
- Volume slider and auto-generate toggle

**`app/components/CustomVoiceManager.tsx`**

- Free-form list of extra voice IDs, shared across all four models
- Shows a model-specific hint (e.g. "Cartesia voice IDs are UUIDs...")

### API Routes

**`app/api/tts/generate/route.ts`** → **`app/misc/ttsCall.ts`**

- POST endpoint to generate speech from text
- Accepts: `text` (string), `voiceId` (string), `model` ("kokoro" | "orpheus" | "cartesia" | "elevenlabs"), and the matching BYOK key field
- Returns MP3 audio data
- Automatically chunks long text at sentence boundaries
- Fully BYOK - no server-side coin deduction happens for TTS; the request 400s if the matching provider key is missing

### Pricing

Defined in `app/misc/ai_prices.ts` (`TTS_MODELS`). These are cost *estimates*
only, used for the optional cost-preview UI - since TTS is BYOK, the actual
amount billed depends on the user's own plan with that provider:

- **Kokoro**: $0.62 / 1M characters (DeepInfra)
- **Orpheus**: $7.00 / 1M characters (DeepInfra)
- **Cartesia Sonic-3**: ~$30 / 1M characters (varies by Cartesia plan tier)
- **ElevenLabs Flash v2.5**: ~$50 / 1M characters (varies by ElevenLabs plan tier)

## Usage

1. Go to **Settings** (gear icon) → **API Keys** tab, add the API key for whichever provider(s) you want to use
2. Go to **Settings** → **Voice** tab, enable TTS
3. Choose a model: Kokoro/Orpheus (DeepInfra), Cartesia Sonic-3, or ElevenLabs Flash v2.5
4. Select a voice from the dropdown (or add a custom voice ID)
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

API keys (`deepinfraKey`, `cartesiaKey`, `elevenlabsKey`) live in
`APIKeysContext`, also backed by localStorage.

## Technical Details

### Audio Generation Flow

1. User clicks "TTS" button
2. Component shows loading state
3. POST request sent to `/api/tts/generate` with text, voiceId, model, and the matching provider key
4. `generateTTSAudio()` cleans markdown and splits into chunks (300-1500 chars depending on model)
5. The provider implied by `model` is called in parallel for each chunk - DeepInfra returns JSON with base64 audio, Cartesia/ElevenLabs return raw MP3 bytes directly
6. Audio chunks concatenated into one MP3 ArrayBuffer
7. MP3 audio returned to client
8. Audio played via HTML5 Audio element

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

- **Orpheus**: 300 character chunks (smaller chunks keep this model's higher per-chunk latency down)
- **Kokoro / Cartesia / ElevenLabs**: 1500 character chunks
- Splits at sentence boundaries when possible
- Falls back to paragraph → newline → space boundaries

## Environment Variables

None required for TTS specifically - all four providers are BYOK, so the
provider API key comes from the request body (`deepinfraKey`/`cartesiaKey`/
`elevenlabsKey`, from `APIKeysContext`/localStorage), not a server env var.
(`DEEPINFRA_API_KEY` does exist as a server env var, but it's used for the
server-side "Coins" LLM/image-generation path elsewhere in the app, not TTS.)

## Error Handling

- Missing API key → 400 error with notification, naming the specific provider
- Invalid text → 400 error
- Rate limit → 429 error with retry message
- Auth failure → 401/403 error
- Chunk errors → Continues with remaining chunks (unless first chunk fails)

## Testing

To test TTS:

1. Start dev server: `npm run dev`
2. Navigate to Settings → API Keys tab, add an API key for the provider(s) you want to test
3. Navigate to Settings → Voice tab, enable TTS and select model/voice
4. Go to a story and generate content
5. Click "TTS" and verify audio plays
6. Test pause/stop controls
7. Try all four models (Kokoro, Orpheus, Cartesia, ElevenLabs)

## Credits

- **DeepInfra**: [Kokoro-82M](https://deepinfra.com/hexgrad/Kokoro-82M), [Orpheus 3B](https://deepinfra.com/canopylabs/orpheus-3b-0.1-ft)
- **Cartesia**: [Sonic-3](https://cartesia.ai)
- **ElevenLabs**: [Flash v2.5](https://elevenlabs.io)
- **Integration**: Your Story - Cartesia/ElevenLabs added July 2026
