# Alternative Architecture: Event-Sourced State (Not Implemented)

## Status: proposed, deliberately not built

This document exists so a future decision to build this — or to explicitly
keep declining it — is made with the reasoning on record, not re-derived
from scratch. It came out of a second research pass ("Bridging Theory to
Code: Evolving your-story Toward the Five-Layer Architecture") that
proposed migrating this app's state storage from a single mutable JSONB
blob to an event-sourced log. That pass could not read this repo's actual
source (blocked by robots.txt) and inferred its recommendations from a task
description alone — so its specific numbers and some framing are generic
advice, not a diagnosis of an actual problem in this codebase. The
underlying idea is real and well-established prior art, though, and worth
recording properly rather than dismissing outright.

## What exists today

Every story is one row:

```sql
CREATE TABLE public.stories (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    ...
    story_data JSONB NOT NULL, -- Full StoryData with current progress
    ...
);
```

(`docs/database-schema.sql`) — `story_data` is the entire `StoryData`
object (`app/misc/structs.ts`): scene history, NPCs, threads, combat state,
inventory (legacy), memory, everything. Every tool executor
(`toolExecutor.ts`, `gmExecutor.ts`) mutates this object in place; the API
layer reads the whole blob, the client mutates it, the whole blob gets
written back. There is no history — `updated_at` changes, but the previous
`story_data` value is simply overwritten and gone. "What did this NPC's
status used to be three scenes ago?" is not an answerable question once the
scene has scrolled out of `scene.parts` and been folded into
`compaction.ts`'s rolling summary.

## What event sourcing would mean here

Instead of storing *current state*, store *every state-changing event that
ever happened*, append-only, and treat "current state" as a value derived
by replaying those events:

```sql
CREATE TABLE public.story_events (
    id BIGSERIAL PRIMARY KEY,
    story_id UUID NOT NULL REFERENCES public.stories(id) ON DELETE CASCADE,
    seq BIGINT NOT NULL,              -- per-story sequence number
    scene_index INT,                   -- which scene.parts index this happened during
    event_type TEXT NOT NULL,          -- e.g. "npc_status_changed", "chaos_adjusted", "item_added"
    entity_id TEXT,                    -- NPC id / thread id / etc., when applicable
    payload JSONB NOT NULL,            -- the event's own data
    created_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE (story_id, seq)
);

CREATE TABLE public.story_snapshots (
    story_id UUID NOT NULL REFERENCES public.stories(id) ON DELETE CASCADE,
    seq BIGINT NOT NULL,               -- snapshot is valid as of this seq
    state_data JSONB NOT NULL,         -- a full StoryData, same shape as today's story_data
    created_at TIMESTAMPTZ DEFAULT NOW(),
    PRIMARY KEY (story_id, seq)
);
```

Every tool executor would, instead of (or in addition to) mutating
`StoryData` directly, append an event describing what changed. "Current
state" for a turn is computed by loading the nearest snapshot at or before
the target `seq` and replaying events after it — snapshotting periodically
(every 100–500 events, per the source paper) keeps replay bounded instead
of growing linearly with campaign length.

## What this would actually buy

- **A real audit trail.** Every state change is permanently recorded, not
  silently overwritten. Useful if this app ever needs to answer "why does
  this NPC's status say X" after the fact — for debugging a GM behavior bug,
  or for moderation/dispute resolution on public/shared stories.
- **True time travel.** "What did the world look like at scene 12?" becomes
  a real query (replay to that seq), not something reconstructable only by
  re-reading old scene prose and guessing.
- **Cleaner save/branch semantics.** A save point is just "replay to seq
  N." Branching a story from an earlier point becomes forking the event log
  at a seq, rather than needing a full state snapshot mechanism built
  separately.
- **Retroactive read models.** If a future feature needs a new way of
  summarizing history (e.g. "how many times has this player negotiated
  vs. fought"), the raw events to compute that already exist — nothing has
  to be added going forward and then wait for enough new data to
  accumulate.

## What it would cost

- **This is a rewrite of every write path, not an additive change.**
  `toolExecutor.ts`, `gmExecutor.ts`, and every place that currently does
  `storyData.npcs[i].status = "dead"` would need to become "append an
  `npc_status_changed` event," with a projection step somewhere translating
  events back into the `StoryData` shape the rest of the app (UI
  components, prompt builders, `ai_staged.ts`) already expects. That
  projection layer is real, non-trivial engineering — not a schema change.
- **Migration risk for existing user data.** Every already-saved story
  would need either a one-time "synthesize a single genesis event from the
  current blob" migration, or a dual-write/dual-read period. Either way,
  this touches every existing story a real user has, which is a much
  higher-stakes migration than anything in this session's work.
- **Operational complexity.** Snapshotting policy, replay performance,
  eventual consistency of any derived read models, and a genuinely new
  class of bug (a projection that doesn't match its events) all become
  ongoing maintenance surface that doesn't exist today.
- **JSONB query performance, if also normalizing.** The source paper
  separately argued for normalizing frequently-queried fields (characters,
  threads, flags) out of JSONB, citing that Postgres keeps no statistics
  inside JSONB columns and falls back to a fixed 0.1% selectivity estimate
  — a real, cited example measured filtering on JSONB at ~2000x slower than
  the normalized equivalent for one workload. This app doesn't currently do
  the kind of cross-story JSONB filtering/joining that failure mode
  requires, so it's a secondary consideration here, not a primary one.

## Why this wasn't built as part of the five-layer work

The five-layer paper's own thesis — the one actually driving this
codebase's design — is "LLM proposes, deterministic engine disposes":
authority over state, randomness, and adjudication has to live outside the
model. Event sourcing is a *storage* decision, orthogonal to that thesis;
none of the five layers (state, oracle, director, memory, adjudication)
require it to be correctly implemented, and this codebase's actual
five-layer work (see `five-layer-architecture-changelog.md`) achieved a
complete, working implementation of all five layers on top of the existing
JSONB-blob storage without needing this change. Every other piece of work
in this repo's audit history — the five-layer migration, this session's
inventory deprecation, the typed-dispatch refactor — followed the same
"extend the existing `StoryData` model, don't replace its storage
architecture" precedent. Event sourcing is the one recommendation that
breaks that pattern completely, and doing it without a concrete driving
need risks being a large, high-risk rewrite for benefits nothing in the
app currently requires.

## When this would become worth reconsidering

Treat this as a real, scoped project (not a "someday, generally good idea")
if any of these become actual product requirements:

- **A "rewind to an earlier point in the story" feature** — replaying to a
  seq is a natural fit for this; the current architecture would need a
  separate, bespoke mechanism.
- **Compliance/moderation requirements for shared or public stories** —
  e.g. needing to show "what actually happened and when" for a disputed or
  reported public story, beyond what scene prose alone shows.
- **A demonstrated, measured performance problem** with the JSONB blob
  approach at real scale (long campaigns, frequent saves) — not a
  theoretical one, an actually-observed one.
- **Multi-writer conflict resolution** — if multiplayer ever moves beyond
  local couch co-op (one device, one writer at a time) to genuinely
  concurrent remote writers, event sourcing's append-only model handles
  conflicting concurrent writes far more gracefully than last-write-wins
  blob overwrites would.

If none of these apply, the honest recommendation is to keep declining this
and revisit only when one of them turns from hypothetical into real.
