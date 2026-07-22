# Text-to-Speech (TTS) Integration

## Overview

The Your Story app features text-to-speech capabilities across two BYOK
providers/models: **Cartesia Sonic-3** (ultra-low-latency) and **ElevenLabs
Flash v2.5** (best-in-class quality). Both are BYOK - the user supplies their
own provider API key in Settings; there is no server-side "Coins" path for
TTS. (DeepInfra's Kokoro/Orpheus models were removed - they were the older,
lower-quality option now that Cartesia and ElevenLabs cover both the
cheap/fast and premium/expressive ends of the spectrum.)

## Features

✅ **Real-time narration** - Listen to AI-generated story content  
✅ **Two TTS models across two providers** - pick low-latency Cartesia or
best-quality ElevenLabs  
✅ **12+ built-in voice options plus custom voice IDs** - provider voice
libraries, expandable via custom voice IDs  
✅ **Playback controls** - Play, pause/resume, and stop audio  
✅ **TTS-friendly text cleaning** - Strips markdown formatting, emoji, and
misc Unicode symbols, and converts markdown tables into short spoken
sentences instead of leaving raw `| a | b |` syntax for the engine to
stumble over  
✅ **Chunked generation** - Handles long text with intelligent, sentence-boundary-aware splitting into small chunks for fast time-to-first-audio  
✅ **Streaming playback** - Starts playing as soon as the first chunk is ready, instead of waiting for the whole narration to finish generating  
✅ **Live auto-narration** - The TTS button doubles as the auto-narrate switch: activating it starts reading sentence-by-sentence as the GM is still streaming the response (in addition to reading whatever's already on screen), instead of waiting for the whole turn to finish  
✅ **Non-destructive stop** - Stopping playback mid-generation only silences it; the remaining audio keeps generating in the background so a later press resumes right where you left off, instead of throwing away work in progress  
✅ **Responsive UI** - Works on mobile and desktop

## TTS Models

### Cartesia Sonic-3 (Cartesia, ~1 credit/character - plan-dependent)

Purpose-built for low-latency, real-time narration. Requires a Cartesia API
key from [play.cartesia.ai](https://play.cartesia.ai/keys). Voice IDs are
UUIDs from Cartesia's voice library - five samples are bundled, add more via
the custom voice field.

### ElevenLabs Flash v2.5 (ElevenLabs, ~0.5 credits/character - plan-dependent) — default

Best-in-class expressiveness and emotional range, still low-latency (~75ms).
Requires an ElevenLabs API key from
[elevenlabs.io/app/settings/api-keys](https://elevenlabs.io/app/settings/api-keys).
Voice IDs come from ElevenLabs' voice library - seven premade voices are
bundled, add more via the custom voice field.

## Available Voices

### Cartesia Voices (bundled samples - full library at play.cartesia.ai)

| Voice ID                              | Name                     |
| -------------------------------------- | ------------------------ |
| `a0e99841-438c-4a64-b679-ae501e7d6091` | Barbershop Man           |
| `156fb8d2-335b-4950-9cb3-a2d33befec77` | Helpful Woman            |
| `f786b574-daa5-4673-aa0c-cbe3e8534c02` | Katie (American Female)  |
| `db6b0ed5-d5d3-463d-ae85-518a07d3c2b4` | Skylar (American Female) |
| `a5136bf9-224c-4d76-b823-52bd5efcffcc` | Jameson (American Male)  |

### ElevenLabs Voices (bundled samples - full library at elevenlabs.io/app/voice-library)

| Voice ID               | Name           |
| ----------------------- | -------------- |
| `21m00Tcm4TlvDq8ikWAM` | Rachel (Female) |
| `EXAVITQu4vr4xnSDxMaL` | Bella (Female)  |
| `ErXwobaYiN019PkySvjV` | Antoni (Male)   |
| `pNInz6obpgDQGcFmaJgB` | Adam (Male)     |
| `TxGEqnHWrfWFTfGW9XjX` | Josh (Male)     |
| `yoZ06aMxZJJ28mfd3POQ` | Sam (Male)      |
| `AZnzlk1XvdvUeBnXmlld` | Domi (Female)   |

Any other voice ID from either provider's voice library can be added via the
custom voice field in Settings - both providers have large libraries that
aren't fully enumerable, so the bundled lists above are convenience defaults,
not the full catalog.

## Implementation

### Components

**`app/components/TTSControls.tsx`**

- Main TTS UI component - a single toggle button (activate/stop/resume/replay)
- Activating the button turns on the persistent `ttsAutoGenerate` setting
  (so future streamed turns start reading themselves too) *and* starts
  reading whatever text is on screen right now - see "Live Auto-Narration"
  below
- Stopping playback mid-generation doesn't cancel the in-flight
  request/stream - it mutes playback while letting the remaining audio keep
  generating in the background, so a later press resumes immediately with
  everything that's ready instead of regenerating from scratch - see
  "Stop vs. Mute" below
- Handles voice/model selection, playback, and audio state
- Picks the matching BYOK key (`cartesiaKey`/`elevenlabsKey`) for the selected model
- Integrates with NotificationContext for user feedback
- Runs a live, sentence-by-sentence auto-narration pipeline when auto-narrate
  is enabled and `storyTextReady` is false (narration still streaming) - see
  "Live Auto-Narration" below

**`app/components/APIKeysModal.tsx`**

- Settings UI for TTS configuration and both provider API keys
- Model selector (Cartesia/ElevenLabs)
- Voice dropdown with organized optgroups, resets to a sensible default voice on model switch
- Volume slider and auto-generate toggle

**`app/components/CustomVoiceManager.tsx`**

- Free-form list of extra voice IDs, shared across both models
- Shows a model-specific hint (e.g. "Cartesia voice IDs are UUIDs...")

### API Routes

**`app/api/tts/generate/route.ts`** → **`app/misc/ttsCall.ts`**

- POST endpoint to generate speech from text
- Accepts: `text` (string), `voiceId` (string), `model` ("cartesia" | "elevenlabs"), and the matching BYOK key field
- Automatically chunks long text at sentence boundaries
- Streams the response body: each chunk's MP3 audio is sent as soon as it's generated, framed as `[4-byte big-endian length][chunk bytes]` (see `frameChunk()`/`generateTTSAudioStream()` in `ttsCall.ts`), instead of waiting for every chunk and concatenating one big buffer. `TTSControls.tsx` reads the frames off the stream and starts playing chunk 0 as soon as it arrives.
- The very first chunk is still awaited before any bytes are streamed, so a bad/rate-limited key fails with a normal JSON error (400/429/403) exactly as before, rather than a half-streamed response
- Fully BYOK - no server-side coin deduction happens for TTS; the request 400s if the matching provider key is missing

### Pricing

Defined in `app/misc/ai_prices.ts` (`TTS_MODELS`). These are cost *estimates*
only, used for the optional cost-preview UI - since TTS is BYOK, the actual
amount billed depends on the user's own plan with that provider:

- **Cartesia Sonic-3**: ~$30 / 1M characters (varies by Cartesia plan tier)
- **ElevenLabs Flash v2.5**: ~$50 / 1M characters (varies by ElevenLabs plan tier)

## Usage

1. Go to **Settings** (gear icon) → **API Keys** tab, add the API key for whichever provider(s) you want to use
2. Go to **Settings** → **Voice** tab, enable TTS
3. Choose a model: Cartesia Sonic-3 or ElevenLabs Flash v2.5
4. Select a voice from the dropdown (or add a custom voice ID)
5. Adjust volume as needed
6. Optionally enable auto-generate for automatic narration
7. On story pages, click "TTS" button to generate and play audio

## Configuration

TTS settings are stored in localStorage:

| Key               | Description                   | Default                  |
| ----------------- | ------------------------------ | ------------------------ |
| `ttsEnabled`      | TTS feature toggle            | `true`                    |
| `ttsModel`        | Selected model                | `"elevenlabs"`            |
| `ttsLastVoice`    | Selected voice ID             | `"21m00Tcm4TlvDq8ikWAM"`  |
| `ttsVolume`       | Playback volume (0-1)         | `1.0`                     |
| `ttsAutoGenerate` | Auto-narrate new content - also flipped to `true` by activating the TTS button | `false` |
| `ttsCustomVoices` | Custom voice IDs (JSON array) | `[]`                      |

API keys (`cartesiaKey`, `elevenlabsKey`) live in `APIKeysContext`, also
backed by localStorage.

## Technical Details

### Audio Generation Flow

1. User clicks "TTS" button - this also flips the persistent `ttsAutoGenerate` setting on
2. Component shows loading state
3. POST request sent to `/api/tts/generate` with text, voiceId, model, and the matching provider key
4. `generateTTSAudioStream()` runs `cleanTextForTTS()` (strips markdown, emoji/symbols, converts tables) and splits the result into 500-character chunks so the first request comes back fast
5. The provider implied by `model` is called in parallel for each chunk - both Cartesia and ElevenLabs return raw MP3 bytes directly
6. The first chunk's audio is awaited, then streamed to the client frame-by-frame as each subsequent chunk finishes (still generated in parallel behind the scenes, just emitted in order)
7. `TTSControls.tsx` parses frames off the response stream and plays chunk 0 in the `<audio>` element the moment it lands, queuing later chunks to play back-to-back via `onended` as they arrive
8. Playback finishes once the last chunk has played and the stream has closed

### Stop vs. Mute

Pressing the button while it's active (playing or loading) always stops
*playback* immediately, but only cancels the underlying generation if
nothing was left to generate anyway:

- If audio is still being generated (a manual whole-text stream mid-flight,
  or a live auto-narration session while the GM is still streaming), the
  press **mutes** rather than aborts: `playbackMutedRef`/`isMuted` go true,
  `onChunkArrived` keeps appending arriving chunks to the cached queue but
  stops auto-playing them, and the underlying fetch/stream keeps running to
  completion in the background.
- Pressing the button again while muted **resumes**: if audio has already
  arrived it starts playing from chunk 0 immediately (same as Replay);
  otherwise it shows the loading state and plays chunk 0 the moment
  `onChunkArrived` delivers it.
- This means a mid-stream Stop never throws away in-flight work - the
  common case is a player wanting a moment of quiet, not to cancel
  narration outright.

### Live Auto-Narration

When `ttsAutoGenerate` is on, narration doesn't wait for the GM's response to
finish before starting - it reads along as the response streams in:

1. `app/story/page.tsx` exposes `storyTextReady` (narrower than the older
   `loadingStage`): `false` from the moment a turn's narration starts
   streaming, `true` once that narration's own text is final (independent of
   the tool-execution/choice-generation phase that runs afterward).
2. `TTSControls.tsx` watches `storyTextReady` flip to `false` and, if
   auto-narrate is on, starts a live session: as `text` grows with each
   streamed token, `extractCompleteSentences()` splits off every
   newly-completed sentence (same `. `/`! `/`? ` boundary heuristic as the
   server's chunk splitter) and queues each one as its own
   `/api/tts/generate` request.
3. Sentence requests are dispatched **sequentially** (not in parallel) so
   audio always arrives - and therefore plays - in the same order the
   sentences were written, even though each request can take a different
   amount of time to complete.
4. Each request's resulting audio is pushed into the same ordered playback
   queue the manual, whole-text flow uses, so the button UI (spinner ->
   Stop -> Replay) behaves identically either way, and pressing the button
   while a live session is playing always stops (mutes) it - `disabled`
   blocks *starting* something new, never stops/mutes/resumes something
   already active. See "Stop vs. Mute" above - muting a live session lets
   the remaining sentences keep generating in the background exactly like
   the manual flow does.
5. When `storyTextReady` flips back to `true`, whatever trailing partial
   sentence is left (no closing punctuation yet, since the stream just
   ended there) is flushed as one final request.

### Text Processing

`cleanTextForTTS()` in `app/misc/ttsCall.ts` automatically:

- Removes markdown symbols (`#`, `*`, `_`, `~`, `` ` ``)
- Removes horizontal rules (`---`, `***`, `___`) and blockquote (`>`) markers
- Converts links `[text](url)` to just `text`
- Removes hidden text (`||spoilers||`)
- Converts GFM pipe tables into short spoken sentences (`| Name | HP |` /
  `| Goblin | 7 |` becomes "Name: Goblin, HP: 7."), and neutralizes any
  other stray `|` characters
- Strips emoji and pictographic symbols (`\p{Extended_Pictographic}`, flag
  sequences, skin-tone modifiers) plus arrows, geometric shapes, dingbats,
  and enclosed-alphanumeric symbol blocks that read aloud as garbage
- Reduces multiple newlines to double newlines
- Removes brackets that may confuse TTS
- Trims whitespace
- Limits to 10,000 characters total (truncated before cleaning)

Covered by `tests/ttsTextCleaning.test.ts`.

### Chunking Strategy

- 500 character chunks for both models
- Small chunk sizes are deliberate: only the *first* chunk gates
  time-to-first-audio (the rest generate in parallel behind it), so keeping
  it short is what makes both the manual and live-narration paths start
  playing quickly instead of waiting on one large request
- Splits at sentence boundaries when possible
- Falls back to paragraph → newline → space boundaries

## Environment Variables

None required for TTS specifically - both providers are BYOK, so the
provider API key comes from the request body (`cartesiaKey`/`elevenlabsKey`,
from `APIKeysContext`/localStorage), not a server env var.

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
7. Try both models (Cartesia, ElevenLabs)

## Credits

- **Cartesia**: [Sonic-3](https://cartesia.ai)
- **ElevenLabs**: [Flash v2.5](https://elevenlabs.io)
- **Integration**: Your Story - Cartesia/ElevenLabs added July 2026; DeepInfra's Kokoro/Orpheus removed July 2026
