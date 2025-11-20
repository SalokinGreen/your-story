# API Reference

This document provides a complete reference for all API endpoints in Your Story.

## Table of Contents

- [Authentication](#authentication)
- [Story Generation](#story-generation)
- [Folders Management](#folders-management)
- [Stories Management](#stories-management)
- [Adventures Management](#adventures-management)
- [Error Handling](#error-handling)

---

## Authentication

All authenticated endpoints require a Bearer token in the `Authorization` header:

```
Authorization: Bearer <supabase_access_token>
```

The token is obtained from Supabase authentication and automatically managed by the `AuthContext`.

### POST /api/auth/signup

Create a new user account.

**Request Body:**

```typescript
{
  email: string;
  password: string;
}
```

**Response (200 OK):**

```typescript
{
  user: User;
  session: Session;
}
```

**Error Responses:**

- `400 Bad Request` - Invalid email or password
- `409 Conflict` - Email already registered

---

### POST /api/auth/signin

Authenticate an existing user.

**Request Body:**

```typescript
{
  email: string;
  password: string;
}
```

**Response (200 OK):**

```typescript
{
  user: User;
  session: Session;
}
```

**Error Responses:**

- `400 Bad Request` - Missing credentials
- `401 Unauthorized` - Invalid credentials

---

### POST /api/auth/signout

End the current user session.

**Headers:**

```
Authorization: Bearer <token>
```

**Response (200 OK):**

```typescript
{
  message: "Signed out successfully";
}
```

**Error Responses:**

- `401 Unauthorized` - Invalid or missing token

---

### GET /api/auth/user

Get the current authenticated user.

**Headers:**

```
Authorization: Bearer <token>
```

**Response (200 OK):**

```typescript
{
  user: User;
}
```

**Error Responses:**

- `401 Unauthorized` - No active session

---

## Story Generation

### POST /api/story/next

Generate the next story segment using AI.

**Headers:**

```
Content-Type: application/json
```

**Request Body:**

```typescript
{
  storyData: StoryData;      // Current game state
  userChoice?: string;       // Optional: player's choice text
  model?: string;            // Optional: specific model to use (e.g., "anthropic/claude-3-sonnet")
  useRawContext?: boolean;   // Optional: use raw AI output in context (default: false)
}
```

**Notes:**

- `model`: If provided, overrides the default model. Useful for testing different models via OpenRouter.
- `useRawContext`: If true, the history context sent to the AI will use the raw, unparsed output from previous turns. This preserves XML tags and hidden reasoning, potentially improving continuity.

````

**StoryData Structure:**
```typescript
interface StoryData {
  player_name: string;
  story_name: string;
  intro: string;
  premise: string;
  scene: Scene;
  stats: Stat[];
  resources: Resource[];
  inventory: InventoryItem[];
  achievements: Achievement[];
  story_lore: StoryLore;
  chapters: Chapter[];
}
````

**Response (200 OK):**

```typescript
{
  part: ScenePart;
  meta: {
    model: string;
    usage: {
      prompt_tokens: number;
      completion_tokens: number;
      total_tokens: number;
    }
  }
}
```

**ScenePart Structure:**

```typescript
interface ScenePart {
  content: string; // Story text (Markdown)
  imageUrl: string; // Optional image URL
  user: boolean; // false for AI, true for player
  choices?: Choice[]; // Available player choices
  commands?: string[]; // Game state modification commands
  memoryEntries?: string[]; // Important events to remember
  endChapter?: boolean; // Chapter completion marker
  endStory?: boolean; // Story completion marker
  gameOver?: boolean; // Game over state
}
```

**Error Responses:**

- `400 Bad Request` - Invalid request body
- `500 Internal Server Error` - AI generation failed
- `503 Service Unavailable` - DeepSeek API unavailable

---

## Folders Management

Organize your stories into customizable folders with icons and colors.

### GET /api/folders

List all folders for the authenticated user.

**Headers:**

```
Authorization: Bearer <token>
```

**Response (200 OK):**

```typescript
{
  folders: StoryFolder[]
}
```

**StoryFolder Structure:**

```typescript
interface StoryFolder {
  id: string; // UUID
  user_id: string; // Owner UUID
  name: string; // Folder name
  color: string; // Hex color (default: #9333ea)
  icon: string; // Emoji icon (default: 📁)
  created_at: string; // ISO timestamp
  updated_at: string; // ISO timestamp
}
```

**Folders ordered by:** Name (ascending)

**Error Responses:**

- `401 Unauthorized` - Missing or invalid token

---

### POST /api/folders

Create a new folder.

**Headers:**

```
Authorization: Bearer <token>
Content-Type: application/json
```

**Request Body:**

```typescript
{
  name: string;            // Required, trimmed
  color?: string;          // Optional, hex color (default: #9333ea)
  icon?: string;           // Optional, emoji (default: 📁)
}
```

**Available Icons:**

- 📁 (Folder)
- ⭐ (Star)
- 🎮 (Game)
- 📚 (Books)
- 🔥 (Fire)
- 💎 (Gem)
- 🎯 (Target)
- 🚀 (Rocket)

**Response (201 Created):**

```typescript
{
  folder: StoryFolder;
}
```

**Error Responses:**

- `400 Bad Request` - Name is required
- `401 Unauthorized` - Missing or invalid token
- `409 Conflict` - Folder name already exists for this user

---

### PATCH /api/folders/[id]

Update an existing folder's properties.

**Headers:**

```
Authorization: Bearer <token>
Content-Type: application/json
```

**Request Body (all optional):**

```typescript
{
  name?: string;
  color?: string;
  icon?: string;
}
```

**Response (200 OK):**

```typescript
{
  folder: StoryFolder;
}
```

**Error Responses:**

- `400 Bad Request` - No valid fields to update
- `401 Unauthorized` - Missing or invalid token
- `403 Forbidden` - You don't own this folder
- `404 Not Found` - Folder doesn't exist
- `409 Conflict` - New name conflicts with existing folder

**Notes:**

- `updated_at` is automatically set on successful update
- Ownership is verified before allowing updates

---

### DELETE /api/folders/[id]

Delete a folder. Stories in the folder become uncategorized.

**Headers:**

```
Authorization: Bearer <token>
```

**Response (200 OK):**

```typescript
{
  message: "Folder deleted successfully";
}
```

**Error Responses:**

- `401 Unauthorized` - Missing or invalid token
- `403 Forbidden` - You don't own this folder
- `404 Not Found` - Folder doesn't exist

**Notes:**

- Stories in deleted folders have their `folder_id` set to `NULL` (via `ON DELETE SET NULL`)
- Deletion is permanent and cannot be undone

---

## Stories Management

### GET /api/stories

List all stories for the authenticated user.

**Headers:**

```
Authorization: Bearer <token>
```

**Response (200 OK):**

```typescript
{
  stories: Story[]
}
```

**Story Structure:**

```typescript
interface Story {
  id: string; // UUID
  user_id: string; // Owner UUID
  name: string; // Story title
  status: string; // "in-progress" | "completed"
  current_chapter: number; // Current chapter number
  folder_id: string | null; // Folder UUID or null
  created_at: string; // ISO timestamp
  updated_at: string; // ISO timestamp
}
```

**Error Responses:**

- `401 Unauthorized` - Missing or invalid token

---

### PATCH /api/stories/[id]

Update a story's properties (including folder assignment).

**Headers:**

```
Authorization: Bearer <token>
Content-Type: application/json
```

**Request Body (all optional):**

```typescript
{
  name?: string;
  status?: "in-progress" | "completed";
  current_chapter?: number;
  folderId?: string | null;  // Move to folder or uncategorize
}
```

**Response (200 OK):**

```typescript
{
  story: Story;
}
```

**Error Responses:**

- `400 Bad Request` - No valid fields to update
- `401 Unauthorized` - Missing or invalid token
- `403 Forbidden` - You don't own this story
- `404 Not Found` - Story doesn't exist

**Notes:**

- Set `folderId: null` to remove story from all folders (uncategorize)
- Set `folderId: "<uuid>"` to move story to a specific folder
- Folder ownership is not verified (you can reference any folder)

---

## Adventures Management

### GET /api/adventures

List all adventures for the authenticated user.

**Headers:**

```
Authorization: Bearer <token>
```

**Response (200 OK):**

```typescript
{
  adventures: Adventure[]
}
```

**Adventure Structure:**

```typescript
interface Adventure {
  id: string; // UUID
  user_id: string; // Owner UUID
  title: string; // Adventure title
  description: string; // Brief description
  status: string; // "draft" | "published"
  rating: number; // Average rating (0-5)
  plays: number; // Play count
  created_at: string; // ISO timestamp
  updated_at: string; // ISO timestamp
}
```

**Error Responses:**

- `401 Unauthorized` - Missing or invalid token

---

## Error Handling

All endpoints follow a consistent error response format:

### Error Response Structure

```typescript
{
  error: string;           // Human-readable error message
  code?: string;           // Optional error code
  details?: any;           // Optional additional details
}
```

### Common HTTP Status Codes

| Code  | Meaning               | Common Causes                                       |
| ----- | --------------------- | --------------------------------------------------- |
| `400` | Bad Request           | Missing required fields, invalid data format        |
| `401` | Unauthorized          | Missing token, expired session, invalid credentials |
| `403` | Forbidden             | Insufficient permissions, not resource owner        |
| `404` | Not Found             | Resource doesn't exist                              |
| `409` | Conflict              | Unique constraint violation (duplicate name)        |
| `500` | Internal Server Error | Unexpected server error, database error             |
| `503` | Service Unavailable   | External API unavailable (DeepSeek)                 |

### Authentication Errors

When a request fails due to authentication:

```typescript
{
  error: "Unauthorized",
  code: "AUTH_REQUIRED"
}
```

Clients should:

1. Check if the user session is still valid
2. Redirect to login if session expired
3. Retry with a fresh token if available

### Validation Errors

When request body validation fails:

```typescript
{
  error: "Validation failed",
  details: {
    field: "name",
    message: "Name is required"
  }
}
```

### Rate Limiting

Currently not implemented. Future versions may include:

- Rate limits per user/IP
- `429 Too Many Requests` responses
- `Retry-After` headers

---

## Data Types Reference

### User (Supabase Auth)

```typescript
interface User {
  id: string;
  email: string;
  created_at: string;
  updated_at: string;
  // ... other Supabase user fields
}
```

### Session (Supabase Auth)

```typescript
interface Session {
  access_token: string;
  refresh_token: string;
  expires_at: number;
  user: User;
}
```

### Choice

```typescript
interface Choice {
  text: string; // Choice text shown to player
  skill_used?: string; // Stat name for skill check
  skill_dc?: number; // Difficulty modifier
  item_used?: string; // Required item for advantage
  item_loss?: boolean; // Consume item on failure
  resource_used?: string; // Resource to consume
  resource_amount?: number; // Amount to consume
  risked_resource?: string; // Resource lost on failure
  risked_amount?: number; // Amount lost on failure
}
```

### Command Format

Commands modify game state and are returned in ScenePart:

```typescript
// Add or remove inventory items
"/modify_item: Sword(+1)";
"/modify_item: Potion(-1)";

// Adjust stats (0-100 range)
"/modify_stat: Strength(+10)";
"/modify_stat: Intelligence(-5)";

// Adjust resources
"/modify_resource: Health(+20)";
"/modify_resource: Stamina(-10)";

// Unlock achievements
"/add_achievement: Dragon Slayer";
```

---

## Examples

### Creating a Folder and Moving a Story

```typescript
// 1. Create a folder
const response1 = await fetch("/api/folders", {
  method: "POST",
  headers: {
    Authorization: `Bearer ${token}`,
    "Content-Type": "application/json",
  },
  body: JSON.stringify({
    name: "Fantasy Adventures",
    color: "#9333ea",
    icon: "🎮",
  }),
});
const { folder } = await response1.json();

// 2. Move a story into the folder
const response2 = await fetch(`/api/stories/${storyId}`, {
  method: "PATCH",
  headers: {
    Authorization: `Bearer ${token}`,
    "Content-Type": "application/json",
  },
  body: JSON.stringify({
    folderId: folder.id,
  }),
});
```

### Generating the Next Story Segment

```typescript
const response = await fetch("/api/story/next", {
  method: "POST",
  headers: {
    "Content-Type": "application/json",
  },
  body: JSON.stringify({
    storyData: currentStoryData,
    userChoice: selectedChoice.text,
  }),
});

const { part, meta } = await response.json();
console.log("Generated:", part.content);
console.log("Tokens used:", meta.usage.total_tokens);
```

### Handling Authentication

```typescript
// Sign up
const { user, session } = await fetch("/api/auth/signup", {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({
    email: "user@example.com",
    password: "securepassword",
  }),
}).then((r) => r.json());

// Store token
localStorage.setItem("token", session.access_token);

// Use token in subsequent requests
const folders = await fetch("/api/folders", {
  headers: {
    Authorization: `Bearer ${session.access_token}`,
  },
}).then((r) => r.json());
```

---

## Best Practices

### Authentication

- Always include the Bearer token for authenticated endpoints
- Handle 401 errors by redirecting to login
- Refresh tokens before they expire using Supabase client

### Error Handling

- Check HTTP status codes before parsing JSON
- Display user-friendly error messages
- Log detailed errors for debugging

### Folder Management

- Validate folder names client-side (non-empty, trimmed)
- Handle 409 conflicts gracefully (suggest alternative names)
- Confirm before deleting folders

### Story Generation

- Show loading states during AI generation
- Implement retry logic for 503 errors
- Cache previous story parts to avoid regeneration

### Performance

- Batch related API calls when possible
- Use optimistic UI updates for better UX
- Implement pagination for large lists (future)

---

## Related Documentation

- [Architecture Overview](./architecture.md) - System design and data flow
- [Getting Started](./getting-started.md) - Setup and installation
- [Game Mechanics](./game-mechanics.md) - Stats, resources, and checks

---

_Last updated: November 16, 2025_
