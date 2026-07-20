# Story Encryption

## Current status: not implemented

This document previously described a client-side, zero-knowledge AES-256-GCM
encryption system (password-derived keys, PBKDF2, an `app/misc/encryption.ts`
module, an `EncryptionMigration` UI component). **That system does not exist
in this codebase.** None of the files it referenced
(`app/misc/encryption.ts`, encryption-aware `AuthContext.tsx` helpers,
`app/components/EncryptionMigration.tsx`) are present, and no
`encryptStoryData`/`decryptStoryData` functions exist anywhere in the repo.

Story data (`StoryData`) is stored and processed as plaintext:

- The database stores `story_data` as a plain JSONB blob (see
  `docs/database-schema.sql`), not an encrypted payload.
- Server-side API routes (`app/api/story/next`, `app/api/story/next-staged`,
  `app/api/generate*`) read and construct prompts from plaintext `StoryData`
  to call the AI providers (DeepSeek/OpenRouter) — this is required for
  narrative generation to work at all, and is incompatible with true
  zero-knowledge encryption without a substantially different architecture
  (client-side prompt construction, or per-request temporary decryption
  server-side with the key never persisted).
- Access to stored stories is protected by standard means: Supabase
  authentication, row-level security policies restricting each user to their
  own rows, and TLS in transit — not by encryption the server cannot itself
  reverse.

`app/misc/structs.ts` still has an unused `EncryptedStoryData` type and a
`Story.storyData: StoryData | EncryptedStoryData` union left over from this
never-completed feature; it has no runtime effect since nothing ever
constructs an `EncryptedStoryData` value.

If real end-to-end encryption is wanted in the future, treat it as a new
feature to design and build (see the architecture note above about why it's
incompatible with server-side prompt construction as this app currently
works), not as something to "re-enable" — there is no prior working
implementation to restore.
