# Sync & offline

## Principles

- **Offline-first.** Local repositories are always the working copy. The UI never
  waits on the network; sync reconciles in the background.
- **Deterministic core.** The merge logic is pure functions
  (`src/services/sync/syncEngine.ts`) — fully unit-tested, no I/O.
- **Idempotent.** `reconcile(reconcile(a,b), b) === reconcile(a,b)`. Re-syncing
  never duplicates, never loses, never flip-flops.

## The engine

`reconcile(local, remote)`:

1. **Collections** (check-ins, periods, treatments, appointments) merge by
   `mergeById`: an id-keyed union (so independent edits to *different* records
   both survive), last-write-wins per record by `updatedAt`, with tombstones
   applied.
2. **Singletons** (preferences, tracking config, privacy map, feedback) are
   device settings: **local wins** where present, remote fills gaps. A device's
   settings are never clobbered by an older cloud copy.
3. **Tombstones** merge keeping the newest per `collection:recordId`.

`mergeById` drops a record when a tombstone deletes it *at or after* the record's
edit time — but a re-creation edited *after* the tombstone wins, so intentional
re-adds aren't eaten.

## Conflict policy

For the **same** record edited on two devices we keep the latest valid
`updatedAt` (last-write-wins). This is the right trade-off for single-user health
tracking: edits are rare, self-consistent, and a lost keystroke is recoverable by
re-editing. We do **not** attempt field-level 3-way merges — the complexity isn't
justified and could silently fabricate a state the user never entered.

Deletions are versioned (tombstones) and beat an older edit of the same id, so a
delete on one device is never resurrected by a stale copy on another
(`syncEngine.test.ts`, `syncService.test.ts`).

## Wiring

`syncService.ts` bridges the engine to storage:

- `buildLocalSnapshot()` reads every repository into a `LocalSnapshot`.
- `sync(backend, accountId)` = pull → `reconcile` → `applySnapshot` (write merged
  result back locally) → push. Guarded by `backend.isConnected()`.
- `recordDeletion(collection, recordId, now)` writes a tombstone; the record
  repositories' `remove` is paired with this at the service layer
  (`appointmentRecordService.remove`).
- `migrateToAccount` is just the first `sync()`.

## Status surfacing

`SyncStatus` (`synced | syncing | offline | needs_attention | local_only`) drives
friendly copy — "Up to date", never "Cloud synchronisation successful". A guest
with no account is `local_only` (not an error state).

## Production notes

Against the real backend (`docs/BACKEND.md`), `revision` becomes an optimistic
concurrency stamp: a push with a stale base revision is rejected, the client
re-pulls and re-reconciles. Because `reconcile` is idempotent, this retry loop is
safe and terminates.
