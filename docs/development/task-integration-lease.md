# Repo/ref integration lease (R02)

`TaskIntegrationService` serializes merges/pushes per `{workspace, repo-target,
base-branch}` so two completed runs cannot interleave remote writes. Before
this change that mutual exclusion was a `pg_advisory_xact_lock` held inside a
`db.transaction` — one pooled connection pinned for the whole remote I/O
(merge worktree, base checkout, push), which stalls under a small pool and
dies unrecoverably if the connection drops mid-write.

## Model

`integration_leases` is a dedicated table (one row per contested key — the
minimal new state needed for cross-process contention, since a CAS on the
`task_topics.integration` jsonb cannot arbitrate two different rows, and
session-scoped advisory locks still pin pool connections):

| field                                     | role                                                                                       |
| ----------------------------------------- | ------------------------------------------------------------------------------------------ |
| `key` (unique)                            | `${workspaceId ?? 'global'}:${repo \|\| deviceId:repoPath}#${baseBranch}`                  |
| `owner_token`                             | random UUID fencing token per acquisition                                                  |
| `phase`                                   | `claimed → prepare → merge → publish → dispatch`, advancing with each fenced mutation      |
| `deadline`                                | lease TTL (60s), renewed by `assert` — expiry is the only reclaim path for a crashed owner |
| `released_at`                             | clean handoff marker                                                                       |
| `outcome_unknown`                         | set when a mutation-phase error leaves the remote state ambiguous                          |
| `expected_base_sha` / `expected_head_sha` | provenance snapshot for reconciliation                                                     |

Contention never holds a connection: `acquire` is a single
`INSERT … ON CONFLICT (key) DO UPDATE WHERE <expired|released|same-owner>
RETURNING`, so the loser sees the existing row unchanged and the winner's row
arrives in the same statement — no lock, no transaction. Losers poll
connection-free (750ms) up to a 120s inline budget, then defer one re-entry
of `integrateOnComplete` via `after()` + 5s delay instead of dying with the
completion callback. The record's own claim/state checks re-gate the retry.

## Fencing

Every remote mutation calls `lease.assert(phase)` — one `UPDATE … WHERE
owner_token AND released_at IS NULL` that renews the deadline and proves
ownership in the same statement. A failed assert throws
`RepoRefLeaseLostError` → outcome `'stale'`, and the caller performs no
further writes. Post-acquire, `resolveCurrentOwner` re-runs so a task whose
state changed while queued cancels the new owner before any side effect.

## Outcome ambiguity

A failure inside a mutation phase does **not** release the row: it is marked
`outcome_unknown` and left to expire at its deadline. The next acquirer
(different owner) receives `prior` and reconciles before writing — remote
verification (`verifyRemoteMerge`, `isBranchMergedInto`, same-SHA push no-op)
is already idempotent, so re-drive is safe. Clean completions `release`, which
clears the ambiguity flag for the next owner; a release failure just means the
row lives until its deadline.

## Rollback boundary

Revert this PR's commit: the service falls back to the advisory-lock path,
and the `integration_leases` table becomes inert (safe to drop or leave). No
data migration is required either direction — lease rows are ephemeral
coordination state, not records.
