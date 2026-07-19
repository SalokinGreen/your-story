# Story Encryption: Status Correction

An earlier version of this document described a completed end-to-end
encryption implementation (AES-256-GCM, PBKDF2 key derivation,
`app/misc/encryption.ts`, an `EncryptionMigration` UI component, etc.).
**That implementation does not exist in this codebase** — none of the files
or functions it described are present.

See `docs/story-encryption.md` for the current, accurate status: story data
is stored and processed as plaintext, protected by standard authentication
and row-level security rather than encryption.

This file is kept only so the discrepancy is documented rather than silently
disappearing; treat `docs/story-encryption.md` as the source of truth going
forward.
