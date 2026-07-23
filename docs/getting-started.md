# Getting Started

This guide will help you set up Your Story for local development.

## Prerequisites

- **Node.js**: LTS version (18 or higher)
- **npm** or **yarn** or **pnpm**
- **DeepSeek API Key**: Get one from [DeepSeek Platform](https://platform.deepseek.com/)
- **Supabase Account**: Create a project at [Supabase](https://supabase.com/)

## Installation

### 1. Clone the Repository

```bash
git clone https://github.com/SalokinGreen/your-story.git
cd your-story
```

### 2. Install Dependencies

```bash
npm install
```

### 3. Environment Setup

Create a `.env.local` file in the project root:

```env
# DeepSeek AI API
DEEPSEEK_API_KEY=your_deepseek_api_key_here
DEEPSEEK_MODEL=deepseek-chat

# OpenRouter (for multi-model support)
OPENROUTER_API_KEY=your_openrouter_key
DEFAULT_AI_MODEL=Deepseek Chat

# Speechify TTS (Optional)
SPEECHIFY_API_KEY=your_speechify_key

# Supabase (Server-side)
SUPABASE_URL=your_supabase_project_url
SUPABASE_KEY=your_supabase_anon_key
SUPABASE_SERVICE_ROLE_KEY=your_service_role_key

# Supabase (Client-side - must have NEXT_PUBLIC_ prefix)
NEXT_PUBLIC_SUPABASE_URL=your_supabase_project_url
NEXT_PUBLIC_SUPABASE_KEY=your_supabase_anon_key

# Optional
NEXT_PUBLIC_SITE_URL=http://localhost:3000

# Optional - cross-device sync (see sync-worker/README.md); the Sync tab in
# Settings stays disabled until this points at a deployed sync-worker
NEXT_PUBLIC_SYNC_API_URL=
```

**Important**: Client-side environment variables MUST be prefixed with `NEXT_PUBLIC_` for Next.js to expose them to the browser.

### 4. Run Development Server

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) in your browser.

### 5. Initialize Database (Folders)

To enable the Library folders feature, run the migration in your Supabase project:

1. Open the Supabase Dashboard → SQL Editor
2. Copy the contents of `docs/folders-setup.sql`
3. Execute the script to create `story_folders` and add `stories.folder_id`

You can re-run this script safely; it uses `IF NOT EXISTS` where applicable.

## Project Commands

```bash
# Development
npm run dev          # Start dev server with hot reload

# Production
npm run build        # Build for production
npm run start        # Start production server

# Code Quality
npm run lint         # Run ESLint
npm run lint -- --fix # Auto-fix linting issues

# Testing
npm run test         # Run Vitest tests
```

## Supabase Setup

### Authentication Configuration

1. Go to your Supabase project dashboard
2. Navigate to **Authentication** → **Providers**
3. Enable **Email** provider
4. Configure email templates (optional)
5. Set **Site URL** to `http://localhost:3000` for development
6. Add `http://localhost:3000/**` to **Redirect URLs**

### Database Tables (Optional)

Folder organization for the Library uses `story_folders` and a `folder_id` column on `stories` (see step 5 above). For additional persistence (e.g., user story saves), you can create extra tables like:

```sql
-- Example: User stories table
create table user_stories (
  id uuid default uuid_generate_v4() primary key,
  user_id uuid references auth.users not null,
  story_name text not null,
  story_data jsonb not null,
  created_at timestamp with time zone default now(),
  updated_at timestamp with time zone default now()
);

-- Row Level Security
alter table user_stories enable row level security;

create policy "Users can view own stories"
  on user_stories for select
  using (auth.uid() = user_id);

create policy "Users can insert own stories"
  on user_stories for insert
  with check (auth.uid() = user_id);

create policy "Users can update own stories"
  on user_stories for update
  using (auth.uid() = user_id);
```

## Troubleshooting

### PostCSS Plugin Errors

If you see errors about `@tailwindcss/postcss` not found:

```bash
npm install @tailwindcss/postcss --save-dev
```

### Vitest Path Alias Issues

If imports fail in tests, ensure `vitest.config.ts` includes:

```typescript
import { defineConfig } from "vitest/config";
import path from "path";

export default defineConfig({
  test: {
    environment: "node",
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./"),
    },
  },
});
```

### Environment Variables Not Loading

- Client-side variables MUST start with `NEXT_PUBLIC_`
- Restart the dev server after changing `.env.local`
- Check `.env.local` is in `.gitignore`

### DeepSeek API Errors

- Verify your API key is correct
- Check your account has credits
- Review rate limits (default model: deepseek-chat)

## Next Steps

- **Explore the codebase**: Start with `app/library/page.tsx` (Library) and `app/story/page.tsx` (Story)
- **Read the architecture**: [Architecture Overview](./architecture.md)
- **Understand game mechanics**: [Game Mechanics](./game-mechanics.md)
- **Learn the AI system**: [AI Integration](./ai-integration.md)

---

Need help? Check the [Contributing](./contributing.md) guide or open an issue on GitHub.
