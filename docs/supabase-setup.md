# Supabase Backend Setup Guide

This guide will help you set up the Supabase backend for Your Story application.

## Prerequisites

1. A Supabase account (https://supabase.com)
2. Environment variables configured in `.env.local`:
   ```
   SUPABASE_URL=your_supabase_url
   SUPABASE_KEY=your_supabase_anon_key
   ```

## Step 1: Create Tables

1. Go to your Supabase project dashboard
2. Navigate to **SQL Editor**
3. Copy and paste the contents of `docs/database-schema.sql`
4. Click **Run** to execute the SQL

This will create:

- `adventures` table - Stores user-created adventures
- `comments` table - Stores comments and ratings for adventures
- `stories` table - Stores individual user playthroughs
- All necessary indexes, RLS policies, and triggers

## Step 2: Run Momentum Migration (if you have existing data)

If you already have stories or adventures in your database, run the momentum migration:

1. Navigate to **SQL Editor**
2. Copy and paste the contents of `docs/momentum-migration.sql`
3. Click **Run** to execute

This will add momentum fields to all existing stories and adventure templates with default values (3/5).

**Note:** New stories created after deploying the momentum system will automatically include momentum fields from the TypeScript interface, so this migration is only needed for existing data.

## Step 3: Verify Tables

1. Navigate to **Table Editor** in your Supabase dashboard
2. Verify that you see three tables:
   - `adventures`
   - `comments`
   - `stories`
3. If you ran the momentum migration, check a story record:
   - Open any story in the Table Editor
   - Expand the `story_data` JSONB field
   - Verify you see `momentum` and `maxMomentum` fields

## Step 4: Test the Setup

You can test by:

1. Creating a new adventure through the creator UI
2. Posting a comment on an adventure
3. Checking the **Table Editor** to see the data

## API Endpoints

The following API endpoints are available:

### Adventures

- `GET /api/adventures` - Fetch all published adventures (with filters)
  - Query params: `userId`, `featured`, `tags`, `difficulty`, `sortBy`, `search`
- `POST /api/adventures` - Create a new adventure
- `GET /api/adventures/[id]` - Fetch a single adventure
- `PATCH /api/adventures/[id]` - Update an adventure
- `DELETE /api/adventures/[id]` - Delete an adventure

### Comments

- `GET /api/comments?adventureId=[id]` - Fetch comments for an adventure
  - Query params: `sortBy` (newest, oldest, likes)
- `POST /api/comments` - Create a new comment
- `PATCH /api/comments/[id]` - Like/unlike a comment
- `DELETE /api/comments/[id]` - Delete a comment

## Security

All tables use Row Level Security (RLS) policies:

### Adventures

- Anyone can view published adventures
- Users can only create/edit/delete their own adventures
- Authors must match the authenticated user

### Comments

- Anyone can view comments
- Authenticated users can create comments
- Users can only edit/delete their own comments

### Story Instances

- Users can only view/create/edit/delete their own story instances
- Story data is stored as JSONB and includes:
  - All game state (scenes, chapters, choices)
  - Player stats, resources, inventory, achievements
  - **Momentum system** (momentum, maxMomentum)
  - Memory and lore

## Automatic Features

The database includes automatic features:

- `updated_at` timestamps are automatically maintained
- Adventure ratings are automatically calculated from comment ratings
- Triggers handle cascading deletes for related records

## Migration from Sample Data

If you want to migrate the sample adventures from `app/misc/sample_adventures.ts` to the database:

1. Create a migration script or manually insert them via SQL Editor
2. Set appropriate `author_id` (use your user ID or create a "system" user)
3. Mark them as `is_published = true` and optionally `is_featured = true`

Example SQL for one adventure:

```sql
INSERT INTO public.adventures (
  title, description, short_description, author_id, author_name,
  tags, difficulty, estimated_duration, popularity, rating, play_count,
  is_published, is_featured, story_template
) VALUES (
  'The Goblin Layer',
  'Venture into the depths...',
  'Battle goblins in treacherous mountain caverns',
  'system-user-id',
  'System',
  ARRAY['Fantasy', 'Combat', 'Exploration', 'Dark'],
  'Medium',
  '3-4 hours',
  8500,
  4.7,
  12340,
  true,
  true,
  '{"story_name": "The Goblin Layer", ...}'::jsonb
);
```

## Troubleshooting

### Can't insert data

- Check that RLS policies are enabled and correct
- Verify you're authenticated when making requests
- Check browser console for error messages

### Queries are slow

- Verify indexes are created (check `database-schema.sql`)
- Check query performance in Supabase **SQL Editor** using `EXPLAIN ANALYZE`

### Rating not updating

- Check that the trigger `update_rating_on_comment` exists
- Verify comments have valid ratings (1-5)

## Next Steps

1. Update the creator page to save to database instead of console.log
2. Update explorer and detail pages to fetch from database
3. Implement story instances for saved game progress
4. Add image upload for thumbnails and banners (using Supabase Storage)
