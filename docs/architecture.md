# Architecture Overview

This document explains the system architecture, data flow, and design patterns used in Your Story.

## High-Level Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                         User Browser                         │
├─────────────────────────────────────────────────────────────┤
│  Landing Page (app/page.tsx)                                │
│    ├─ AuthForm / UserProfile                                │
│    └─ Navigation to Story                                   │
├─────────────────────────────────────────────────────────────┤
│  Story Page (app/story/page.tsx)                            │
│    ├─ StoryData initialization                              │
│    └─ Story Component (story.tsx)                           │
│         ├─ Story text display (Markdown)                    │
│         ├─ Choice selection                                 │
│         ├─ Dice rolling & checks                            │
│         └─ Command processing                               │
├─────────────────────────────────────────────────────────────┤
│  Library Page (app/library/page.tsx)                        │
│    ├─ Dual views: Stories | Adventures                      │
│    ├─ Search, filter, and sort controls                     │
│    ├─ Folders sidebar with counts                           │
│    └─ Create/Edit/Delete/Move folders & assign stories      │
├─────────────────────────────────────────────────────────────┤
│  Global Components                                           │
│    ├─ NotificationContainer (toast notifications)           │
│    ├─ AuthContext (user state)                              │
│    └─ NotificationContext (alerts)                          │
└─────────────────────────────────────────────────────────────┘
                           ▼
┌─────────────────────────────────────────────────────────────┐
│                    Next.js API Routes                        │
├─────────────────────────────────────────────────────────────┤
│  /api/story/next (POST) - Standard Generation              │
│    ├─ Receives StoryData + user choice + model              │
│    ├─ Builds prompt (buildMessages)                         │
│    ├─ Calls AI provider (DeepSeek/OpenRouter)              │
│    ├─ Parses response (outputToScenePart)                   │
│    └─ Returns ScenePart + metadata                          │
├─────────────────────────────────────────────────────────────┤
│  /api/story/next-staged (POST) - Staged Generation         │
│    ├─ Receives StoryData + model options per stage          │
│    ├─ Stage 1: Story narration (buildStoryPrompt)          │
│    ├─ Stage 2a: Tool calls (buildToolPrompt + schemas)     │
│    ├─ Stage 2b: Choices (buildChoicesPrompt)               │
│    ├─ Executes tools via executeTools                       │
│    └─ Returns ScenePart + stage breakdown                   │
├─────────────────────────────────────────────────────────────┤
│  /api/folders (GET, POST)                                   │
│    ├─ Requires auth (Bearer token)                          │
│    ├─ GET: List user's folders (ordered by name)            │
│    └─ POST: Create folder (name/color/icon)                 │
├─────────────────────────────────────────────────────────────┤
│  /api/folders/[id] (PATCH, DELETE)                          │
│    ├─ Requires auth + ownership                             │
│    ├─ PATCH: Update name/color/icon                         │
│    └─ DELETE: Remove folder (stories set to uncategorized)  │
├─────────────────────────────────────────────────────────────┤
│  /api/stories/[id] (PATCH)                                  │
│    └─ Accepts { folderId: string | null } to move story     │
├─────────────────────────────────────────────────────────────┤
│  /api/auth/* (POST/GET)                                     │
│    ├─ /signup - User registration                           │
│    ├─ /signin - User login                                  │
│    ├─ /signout - User logout                                │
│    └─ /user - Get current user                              │
└─────────────────────────────────────────────────────────────┘
                           ▼
┌─────────────────────────────────────────────────────────────┐
│                    External Services                         │
├─────────────────────────────────────────────────────────────┤
│  DeepSeek API (https://api.deepseek.com)                    │
│    └─ Chat Completions endpoint                             │
├─────────────────────────────────────────────────────────────┤
│  OpenRouter API (https://openrouter.ai)                     │
│    └─ Multi-model proxy (Claude, GPT-4o, Gemini, etc.)     │
├─────────────────────────────────────────────────────────────┤
│  Supabase                                                    │
│    ├─ Authentication                                         │
│    ├─ Database: stories, adventures, story_folders          │
│    └─ Storage: avatars, images                              │
└─────────────────────────────────────────────────────────────┘
```

## Data Flow

### 1. Story Initialization

```typescript
StoryData (from starter_stories.ts)
   ↓
Story Component (spread as props)
   ↓
Initial scene.parts[0] with intro
   ↓
Render story text + choices
```

### 2. User Makes a Choice

```typescript
User clicks choice
   ↓
handleSelect() - Update input state
   ↓
User clicks "Next" button
   ↓
handleChoice() - Process choice locally
   ├─ Dice roll (d100)
   ├─ Item check (advantage/disadvantage)
   ├─ Resource usage
   ├─ Skill check (stat + DC)
   ├─ Failure penalties
   └─ Add user ScenePart to scene.parts
   ↓
Fetch /api/story/next with StoryData
   ↓
API calls DeepSeek
   ↓
Response parsed to ScenePart
   ↓
Process commands (modify items/stats/resources/achievements)
   ↓
Add memory entries
   ↓
Add AI ScenePart to scene.parts
   ↓
Update UI with new story text + choices
```

## Core Modules

### app/misc/structs.ts

**Purpose**: Single source of truth for TypeScript interfaces.

**Key Types**:

- `StoryData`: Complete game state
- `ScenePart`: Story segment with content, choices, commands
- `Choice`: Player option with metadata
- `Stat`, `Resource`, `InventoryItem`, `Achievement`: Game entities

**Pattern**: All types are imported with `import type` for tree-shaking.

### app/misc/ai.ts

**Purpose**: AI integration layer - prompt building and response parsing.

**Key Functions**:

- `buildMessages()`: Converts StoryData to chat history
- `outputToScenePart()`: Parses AI response (XML-like tags)
- `storyDataToString()`: Formats context for AI prompt

**Pattern**: Uses string templates and regex for parsing.

### app/misc/auth.ts

**Purpose**: Supabase authentication helpers.

**Functions**: `signUp`, `signIn`, `signOut`, `getCurrentUser`, `getSession`

**Pattern**: Async functions returning `{ data, error }` tuples.

### app/misc/AuthContext.tsx

**Purpose**: React context for global auth state.

**Provides**: `{ user, loading, signUp, signIn, signOut }`

**Pattern**: Custom hook `useAuth()` for consuming context.

### app/misc/NotificationContext.tsx

**Purpose**: Toast notification system.

**Provides**: `{ addNotification, removeNotification, notifications }`

**Pattern**: Auto-dismiss after 4 seconds, stacked in top-right corner.

## Component Hierarchy

```
RootLayout (app/layout.tsx)
├─ NotificationProvider
│  └─ AuthProvider
│     └─ Page Content
└─ NotificationContainer (fixed position)

Landing Page (app/page.tsx)
├─ AuthForm (if not logged in)
└─ UserProfile (if logged in)

Story Page (app/story/page.tsx)
├─ Story Name Header
├─ Navigation Buttons (Stats, Inventory, Lore, etc.)
└─ Story Component (app/story/story.tsx)
   ├─ Story Text (Markdown)
   ├─ Loading Spinner (during generation)
   ├─ Choice List
   │  └─ Choice Items (with checkboxes)
   └─ Next Button
```

## State Management

### Component-Level State (useState)

Used in `Story` component:

- `choices`: Current available choices
- `input`: Selected choice (one at a time)
- `storyText`: Current scene content
- `loading`: Generation in progress
- `started`: Initialization flag

### Context State (React Context)

Global state shared across components:

- `AuthContext`: User authentication state
- `NotificationContext`: Toast notifications queue

### Props-Based State

`StoryData` is passed as spread props to `Story`:

```typescript
<Story {...storyData} />
```

This allows direct mutation (not recommended for production, but works for prototype).

## Design Patterns

### 1. Spread Props Pattern

```typescript
// In page.tsx
<Story {...storyData} />;

// In story.tsx
export default function Story(storyData: StoryData) {
  // Access all StoryData fields directly
}
```

**Pros**: Clean, type-safe, minimal boilerplate
**Cons**: Direct mutation can cause bugs

### 2. Command Pattern

AI issues commands that are parsed and executed:

```typescript
"/modify_item: Sword(+1)"
   ↓
processCommands(["/modify_item: Sword(+1)"], storyData)
   ↓
Parse command → Execute → Notify user
```

### 3. Observer Pattern

Notifications are observed by `NotificationContainer`:

```typescript
addNotification("Message", "success")
   ↓
Notification added to context state
   ↓
NotificationContainer re-renders
   ↓
Toast appears and auto-dismisses
```

### 4. Factory Pattern

Choice parsing in `ai.ts`:

```typescript
parseChoice(line: string): Choice
   ↓
Extract metadata from <...>
   ↓
Return structured Choice object
```

## API Routes

### POST /api/story/next

**Input**:

```typescript
{
  storyData: StoryData,
  userChoice?: Choice
}
```

**Output**:

```typescript
{
  part: ScenePart,
  meta: { model: string, usage: object }
}
```

**Flow**:

1. Validate request body
2. Build chat messages from StoryData
3. Call DeepSeek API with system prompt
4. Parse response to ScenePart
5. Return structured data

### Auth Routes

- `POST /api/auth/signup`: Create new user
- `POST /api/auth/signin`: Authenticate user
- `POST /api/auth/signout`: End session
- `GET /api/auth/user`: Get current user

### Folders Routes

- `GET /api/folders`: List folders for current user
- `POST /api/folders`: Create a folder `{ name: string, color?: string, icon?: string }`
- `PATCH /api/folders/[id]`: Update folder `{ name?, color?, icon? }`
- `DELETE /api/folders/[id]`: Delete folder (stories become uncategorized)

Notes:

- All folder endpoints require an authenticated Supabase session; the API uses an auth-bound Supabase client under RLS.
- Moving a story between folders is done via `PATCH /api/stories/[id]` with `{ folderId: string | null }`.

## Performance Considerations

### Client-Side

- **Lazy loading**: Components loaded on-demand
- **Memoization**: Use `useMemo` for expensive calculations (future)
- **Debouncing**: Prevent rapid API calls (loading state)

### Server-Side

- **Streaming**: Could stream AI responses (future)
- **Caching**: Cache StoryData in database (future)
- **Rate limiting**: Prevent API abuse (future)

## Security

### API Key Protection

- API keys in `.env.local` (not committed)
- Server-side API routes only
- Client never sees DEEPSEEK_API_KEY

### Input Validation

- TypeScript type checking
- API route parameter validation
- Supabase Row Level Security (RLS)

### Content Safety

- AI system prompt enforces PG-13 content
- User input sanitized before prompts
- Markdown rendering is safe (react-markdown)

## Testing Strategy

### Unit Tests

- `tests/ai.outputToScenePart.test.ts`: Parser logic
- `tests/api.story.next.test.ts`: API route (mocked)

### Integration Tests (Future)

- Full story flow end-to-end
- Auth flow testing
- Command execution verification

## Next Steps

- [Game Mechanics](./game-mechanics.md) - Understand stats, checks, items
- [AI Integration](./ai-integration.md) - Deep dive into prompts
- [API Reference](./api-reference.md) - Complete API documentation

Related setup:

- Run the database migration in `docs/folders-setup.sql` to create `story_folders` and add `stories.folder_id`.

---

_Last updated: November 16, 2025_
