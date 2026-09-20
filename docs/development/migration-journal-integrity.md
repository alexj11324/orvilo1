# Migration journal integrity

Drizzle's PG migrator decides which entries to run by comparing each journal
`when` (folderMillis) against `MAX(created_at)` in `drizzle.__drizzle_migrations`.
An entry journaled with a `when` earlier than an already-applied entry is
**silently skipped** on staged upgrades — the deploy carrying it never applies
it, while new code already reads the columns it adds. `0179` (which adds
`integration_leases.fence_seq`) was journaled with `when` before `0178`'s and
would have been skipped by exactly this path.

## Invariant

`meta/_journal.json` entries must keep `idx` gap-free and `when` **strictly
increasing** in journal order. When two migrations land in the same millisecond
or out of order, bump the later entry's `when` past the previous entry — never
leave an inversion. Do this _before_ release; after an entry has been applied
anywhere, repair forward with an idempotent migration instead of rewriting
history.

## Guard

`packages/database/src/core/__tests__/migrationJournal.test.ts` enforces the
ordering statically in every test run, and — under the server-DB suite
(`TEST_SERVER_DB=1`, CI `test-database` job) — replays the real two-stage path:
a scratch database migrated to the previous boundary, then the real folder
applied on top, asserting the tail migration's artifact actually exists.
