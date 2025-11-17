# Text-to-Speech (TTS) Integration with Speechify

## Overview

The Your Story app now features text-to-speech capabilities powered by Speechify's API. Users can listen to the generated story content with multiple voice options.

## Features

✅ **Real-time narration** - Listen to AI-generated story content  
✅ **6 voice options** - Choose from MrBeast, Henry, Snoop, Gwyneth, Cliff, and George  
✅ **Playback controls** - Play, pause, and stop audio  
✅ **Markdown stripping** - Automatically cleans formatting for better speech  
✅ **Text limiting** - Max 5000 characters per request to respect API limits  
✅ **Responsive UI** - Works on mobile and desktop

## Implementation

### Components

**`app/components/TTSControls.tsx`**

- Main TTS UI component
- Handles voice selection, playback, and audio state
- Integrates with NotificationContext for user feedback

### API Routes

**`app/api/tts/generate/route.ts`**

- POST endpoint to generate speech from text
- Accepts `text` (string) and `voiceId` (string, optional, defaults to 'mrbeast')
- Returns MP3 audio data
- Strips markdown formatting for cleaner speech
- Limits text to 5000 characters

### Integration Points

**`app/story/story.tsx`**

- TTS controls displayed at the top of the story content
- Passes `storyText` (current scene content) to TTSControls
- Disabled during loading states

## Available Voices

| Voice ID  | Name       | Description                   |
| --------- | ---------- | ----------------------------- |
| `mrbeast` | MrBeast 🎬 | Energetic, engaging narrator  |
| `henry`   | Henry 🇬🇧   | British accent, sophisticated |
| `snoop`   | Snoop 🎤   | Cool, laid-back tone          |
| `gwyneth` | Gwyneth 🎭 | Elegant, theatrical           |
| `cliff`   | Cliff 🎙️   | Deep, authoritative voice     |
| `george`  | George 🇺🇸  | Clear, neutral US accent      |

## Usage

1. Navigate to a story in `/story`
2. Click the voice selector dropdown (shows current voice with emoji)
3. Choose your preferred narrator
4. Click "Read Aloud" to generate and play audio
5. Use "Pause" or "Stop" to control playback
6. Audio automatically stops when new content is generated

## API Configuration

Requires `SPEECHIFY_API_KEY` in `.env` file:

```bash
SPEECHIFY_API_KEY=your_api_key_here
```

## Technical Details

### Audio Generation Flow

1. User clicks "Read Aloud"
2. Component shows loading state
3. POST request sent to `/api/tts/generate` with text and voiceId
4. API cleans markdown from text
5. Speechify API called with cleaned text
6. Audio blob returned to client
7. Audio played via HTML5 Audio element
8. Success notification shown to user

### Text Processing

The API automatically:

- Removes markdown symbols (`#`, `*`, `_`, `~`, `` ` ``)
- Converts links `[text](url)` to just `text`
- Reduces multiple newlines to double newlines
- Trims whitespace
- Limits to 5000 characters

### State Management

- **isPlaying**: Boolean indicating if audio is currently playing
- **isLoading**: Boolean for loading state during generation
- **selectedVoice**: Current voice ID from dropdown
- **showVoiceMenu**: Dropdown visibility toggle
- **audioRef**: React ref to HTML5 Audio element
- **audioUrl**: Object URL for current audio blob

### Error Handling

- Missing API key → 500 error with notification
- Invalid text → 400 error
- Speechify API errors → Logged and shown to user
- Audio playback errors → Notification shown

## Future Enhancements

Potential improvements:

- [ ] Cache generated audio for repeated playback
- [ ] Add playback speed controls
- [ ] Support for multiple languages
- [ ] Auto-play next scene option
- [ ] Download audio file option
- [ ] Volume control slider
- [ ] Progress indicator for long audio

## Testing

To test TTS:

1. Start dev server: `npm run dev`
2. Sign in and navigate to a story
3. Generate story content via AI
4. Click voice selector and choose a voice
5. Click "Read Aloud" and verify audio plays
6. Test pause/stop controls
7. Generate new content and verify audio stops

## Troubleshooting

**Audio doesn't play:**

- Check browser console for errors
- Verify SPEECHIFY_API_KEY is set in .env
- Check network tab for API response
- Try different browser (some have autoplay restrictions)

**Voice menu doesn't close:**

- Click voice button again to toggle
- Check for console errors

**Text is truncated:**

- TTS limits to 5000 characters
- For longer content, consider splitting into chunks

## Cost Considerations

Speechify API has usage limits and costs. Monitor usage via:

- Check Speechify dashboard for API calls
- Consider implementing client-side caching
- Add rate limiting if needed for production

## Credits

- **TTS Provider**: [Speechify API](https://speechify.com/api)
- **Integration**: Your Story v0.1.0
- **Author**: Implemented November 2025
