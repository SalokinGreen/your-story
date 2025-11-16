# Backend Integration Complete

## Overview

The application now has full database integration with Supabase. Adventures and stories are stored in PostgreSQL, and all components fetch from the database in real-time.

## Changes Made

### 1. API Routes

#### Stories API
- **`/api/stories` (GET/POST)**
  - GET: Fetch user's stories with optional filters (userId, adventureId, isPublic)
  - POST: Create new story from adventure template or from scratch

- **`/api/stories/[id]` (GET/PATCH/DELETE)**
  - GET: Fetch single story by ID
  - PATCH: Update story progress, completion status, or public visibility
  - DELETE: Delete a story

#### Adventures API (Enhanced)
- **`/api/adventures` (GET/POST)**
  - GET: Now supports `limit` parameter for top N results
  - Other filters: userId, featured, tags, difficulty, sortBy, search

### 2. Frontend Updates

#### Adventure Creator (`/creator`)
- Now saves adventures to database via POST to `/api/adventures`
- Adventures are published immediately (isPublished: true)
- Redirects to adventure detail page on success
- Includes author name from user metadata

#### Explorer (`/explorer`)
- Fetches all adventures from database with real-time filtering
- Loading states with skeleton cards
- Dynamic tag extraction from database
- Difficulty filters work with lowercase database values
- Empty state when no adventures match filters

#### Adventure Detail (`/explorer/[adventureId]`)
- Fetches adventure data from database
- "Start Adventure" button creates new story instance
- Story creation copies adventure's storyTemplate to new story
- Redirects to `/story?storyId=X` on success
- Loading and starting states with spinners

#### Landing Page (`/`)
- Fetches top 3 most popular adventures from database
- Loading skeletons while fetching
- Empty state if no adventures exist
- Dynamic difficulty colors (capitalize CSS class)

### 3. Data Model Updates

#### Difficulty Values
- Database stores lowercase: "easy", "medium", "hard", "expert"
- UI displays capitalized version
- Filter buttons use lowercase values

#### Story Creation Flow
1. User clicks "Start Adventure" on adventure detail page
2. POST to `/api/stories` with:
   - adventureId (links to original template)
   - userId (current user)
   - storyName (auto-generated: "Title - Date")
   - storyData (copy of adventure.storyTemplate)
   - isPublic: false (private by default)
3. API returns new story with ID
4. Redirect to `/story?storyId=X` to play

## Next Steps

### Story Playback Integration
The story page (`/app/story/page.tsx`) currently uses module-scoped sample data. It needs to:

1. Accept `storyId` query parameter from URL
2. Fetch story data from `/api/stories/[id]`
3. Load storyData into component state
4. Save progress after each choice via PATCH to `/api/stories/[id]`
5. Support marking story as completed

Example implementation:
```tsx
"use client";

import { useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { StoryData } from "@/app/misc/structs";

export default function StoryPage() {
  const searchParams = useSearchParams();
  const storyId = searchParams.get("storyId");
  const [storyData, setStoryData] = useState<StoryData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!storyId) return;

    const fetchStory = async () => {
      try {
        const response = await fetch(`/api/stories/${storyId}`);
        const { story } = await response.json();
        setStoryData(story.story_data);
      } catch (error) {
        console.error("Error loading story:", error);
      } finally {
        setLoading(false);
      }
    };

    fetchStory();
  }, [storyId]);

  // Save progress after updates
  const saveProgress = async (updatedStoryData: StoryData) => {
    try {
      await fetch(`/api/stories/${storyId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          storyData: updatedStoryData,
        }),
      });
    } catch (error) {
      console.error("Error saving progress:", error);
    }
  };

  // Rest of component...
}
```

### User Story Management UI
Create `/my-stories` page to:
- List all user's stories (GET `/api/stories?userId=X`)
- Show completion status, last played date
- Continue or delete stories
- Toggle public/private visibility

### Image Uploads
- Implement Supabase Storage integration for adventure thumbnails/banners
- Update creator to allow image uploads
- Store URLs in adventure records

### Database Deployment
1. Run `docs/database-schema.sql` in Supabase SQL Editor
2. Verify RLS policies are active
3. Check indexes are created
4. Test triggers (e.g., rating auto-update on comments)

### Sample Data Migration
Convert sample_adventures.ts data to database records:
- Create migration script
- POST each sample adventure via API
- Set appropriate featured/published flags
- Assign to system user or create author accounts

## Testing Checklist

- [ ] Create new adventure in creator
- [ ] Adventure appears in explorer immediately
- [ ] Filter and search work correctly
- [ ] Start adventure creates story instance
- [ ] Story redirect works (when story page is updated)
- [ ] Comments work on adventure detail page
- [ ] Popular Today section shows top 3
- [ ] Empty states display when no data
- [ ] Loading states show during fetches

## Environment Variables Required

```env
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_KEY=your-anon-key
DEEPSEEK_API_KEY=your-deepseek-key
```
