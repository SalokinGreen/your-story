# Your Story - Documentation

Welcome to **Your Story**, an AI-powered interactive narrative game inspired by Choice of Games. This documentation covers everything you need to know about the project architecture, features, and development.

## 📚 Documentation Index

- [Getting Started](./getting-started.md) - Setup and installation guide
- [Architecture Overview](./architecture.md) - System design and data flow
- [API Reference](./api-reference.md) - Complete API endpoint documentation ✨ NEW
- [Game Mechanics](./game-mechanics.md) - Stats, resources, items, and checks
- [AI Integration](./ai-integration.md) - LLM prompts, commands, and story generation
- [UI Components](./ui-components.md) - Frontend components and styling
- [Story Creation](./story-creation.md) - How to create and structure stories
- [Contributing](./contributing.md) - Development guidelines and best practices

## 🎮 Quick Overview

Your Story is a Next.js 16 application that generates interactive, choice-driven narratives using AI (DeepSeek). Players make meaningful choices that affect:

- **Stats**: Character attributes (0-100%)
- **Resources**: Consumable values (Health, Stamina, etc.)
- **Inventory**: Items that provide advantages or are consumed
- **Story Progression**: Branching narratives with multiple endings
- **Achievements**: Unlockable milestones

## 🚀 Key Features

- **Dynamic Story Generation**: AI creates unique story continuations based on player choices
- **Library Management**: Unified Library page with Stories/Adventures views, search, filters, and sorting
- **Folders**: Organize stories into color/icon-customizable folders with create/edit/delete and move operations
- **Skill Checks**: D100 rolls against difficulty classes with advantage/disadvantage
- **Resource Management**: Track health, stamina, and other consumables
- **Item System**: Use items for advantages, risk losing them on failure
- **Memory System**: AI remembers important story events
- **Toast Notifications**: Real-time feedback on checks, items, and achievements
- **Mobile Responsive**: Optimized for both desktop and mobile play
- **Markdown Support**: Rich text formatting in story content
- **Authentication**: Supabase-powered user accounts

## 🛠️ Tech Stack

- **Framework**: Next.js 16 (App Router)
- **Language**: TypeScript (strict mode)
- **UI**: React 19 + Tailwind CSS v4
- **AI**: DeepSeek Chat Completions API
- **Auth**: Supabase Authentication
- **Testing**: Vitest
- **Markdown**: react-markdown

## 📦 Project Structure

```
your-story/
├── app/
│   ├── api/              # API routes (story generation, auth)
│   ├── components/       # Reusable UI components
│   ├── misc/             # Core logic (AI, auth, types)
│   ├── library/          # Library page (search/filter/sort, folders)
│   ├── story/            # Story pages and components
│   ├── globals.css       # Global styles and animations
│   ├── layout.tsx        # Root layout with providers
│   └── page.tsx          # Landing page
├── docs/                 # Documentation (you are here!)
├── tests/                # Unit and integration tests
└── public/               # Static assets
```

## 🎯 Core Concepts

### StoryData
The central data structure containing all game state: player info, stats, resources, inventory, current chapter, scene history, and memory.

### ScenePart
Individual story segments with content, choices, commands, and optional markers (endChapter, endStory, gameOver).

### Choice
Player options with optional metadata:
- `skill_used` + `skill_dc`: Triggers a skill check
- `item_used` + `item_loss`: Requires/consumes an item
- `resource_used`: Consumes resource
- `risked_resource`: Lost on failure

### Commands
AI can issue commands to modify game state:
- `/modify_item: name(amount)` - Add/remove items
- `/modify_stat: name(amount)` - Adjust stats
- `/modify_resource: name(amount)` - Adjust resources
- `/add_achievement: title` - Unlock achievements

## 🎲 Dice Mechanics

- **Base Roll**: D100 (1-100)
- **Check Formula**: `Roll + Stat Value ≥ DC`
- **Success**: Total ≥ DC (or roll = 100 for critical success)
- **Advantage**: Roll twice, take lower (item present)
- **Disadvantage**: Roll twice, take higher (item missing)

## 📖 Next Steps

1. **New to the project?** Start with [Getting Started](./getting-started.md)
2. **Want to understand the code?** Read [Architecture Overview](./architecture.md)
3. **Building features?** Check [API Reference](./api-reference.md)
4. **Creating stories?** See [Story Creation](./story-creation.md)
5. **Contributing?** Read [Contributing](./contributing.md)

Setup note:
- To enable folders, run the migration in `docs/folders-setup.sql` in your Supabase SQL Editor.

## 🔗 External Resources

- [Next.js Documentation](https://nextjs.org/docs)
- [DeepSeek API](https://platform.deepseek.com/)
- [Supabase Docs](https://supabase.com/docs)
- [Tailwind CSS](https://tailwindcss.com/)

---

*Last updated: November 16, 2025*
